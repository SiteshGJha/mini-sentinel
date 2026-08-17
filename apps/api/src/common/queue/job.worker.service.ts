import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ValidationPipeline } from '../../validation/validation.pipeline';
import { DecisionEngine } from '../../decision/decision.engine';
import { AuditService } from '../../audit/audit.service';
import { RequestExecutor } from '../../integration/executor.service';
import { ReviewService } from '../../workflow/review.service';
import { NotifierService } from '../../integration/notifier.service';
import { MetricsService } from '../../integration/metrics.service';
import { ConfigurationService } from '../../config/configuration.service';
import { AiClassifierService } from '../../ai/classifier.service';
import { RawRequest, ParsedRequest, Decision, ValidationResult } from '../types';

@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorkerService.name);
  private readonly queueName = 'pii_compliance_jobs';
  private blockingClient: Redis;
  private running = false;
  private workerPromise: Promise<void> | null = null;

  constructor(
    private readonly validationPipeline: ValidationPipeline,
    private readonly decisionEngine: DecisionEngine,
    private readonly auditService: AuditService,
    private readonly executor: RequestExecutor,
    private readonly reviewService: ReviewService,
    private readonly notifier: NotifierService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigurationService,
    private readonly aiClassifier: AiClassifierService,
  ) {}

  onModuleInit() {
    this.running = true;
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Create dedicated client for blocking pop (brpop)
    this.blockingClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Critical for blocking operations
    });

    this.logger.log('Starting JobWorkerService background event loop...');
    this.workerPromise = this.startWorkerLoop();
  }

  async onModuleDestroy() {
    this.logger.log('Stopping JobWorkerService...');
    this.running = false;
    
    if (this.blockingClient) {
      try {
        await this.blockingClient.quit();
      } catch (err) {
        this.logger.error(`Error closing blocking Redis connection: ${err.message}`);
      }
    }

    if (this.workerPromise) {
      await this.workerPromise;
    }
  }

  private async startWorkerLoop(): Promise<void> {
    while (this.running) {
      try {
        // Block for up to 5 seconds waiting for a job
        const result = await this.blockingClient.brpop(this.queueName, 5);
        if (result && result.length === 2) {
          const [, payloadStr] = result;
          const job = JSON.parse(payloadStr);
          await this.processJob(job);
        }
      } catch (error: any) {
        if (this.running) {
          this.logger.error(`Error in queue worker event loop: ${error.message}`);
          // Prevent rapid spinning on connection/system failures
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  private async processJob(job: {
    requestId: string;
    rawRequest: RawRequest;
    parsedRequest: ParsedRequest;
  }): Promise<void> {
    const startTime = performance.now();
    const { requestId, rawRequest, parsedRequest } = job;
    this.logger.log(`Processing queued compliance check job: ${requestId}`);

    let success = true;
    try {
      // 1. Run AI Intent Classification
      let aiClassification: string | undefined;
      const messageText = parsedRequest.parameters.message || parsedRequest.parameters.emailBody || parsedRequest.parameters.text;
      if (messageText && typeof messageText === 'string') {
        aiClassification = await this.aiClassifier.classify(messageText);
        parsedRequest.parameters.aiClassification = aiClassification;
      }

      // 2. Validate Pipeline
      const { result: validationResult, redactedRequest } = await this.validationPipeline.validate(parsedRequest);

      // 3. Make Verdict Decision
      const decision = this.decisionEngine.decide(redactedRequest, validationResult);

      // Observe vs Enforce override
      const executionMode = this.configService.get<string>('execution_mode', 'ENFORCE');
      const originalVerdict = decision.verdict;
      let isObserveOverride = false;

      if (executionMode === 'OBSERVE' && decision.verdict !== 'APPROVE') {
        isObserveOverride = true;
        decision.verdict = 'APPROVE';
        decision.reasoning = `[OBSERVE ONLY OVERRIDE] Request would have been ${originalVerdict} due to compliance violations, but was allowed under OBSERVE mode. Original reasoning: ${decision.reasoning}`;
      }

      let executionResult: any = null;
      let escalationTicketId: string | undefined;

      // 4. Handle Decision Verdicts
      if (decision.verdict === 'APPROVE') {
        // Execute target tool
        executionResult = await this.executor.execute(redactedRequest);
      } else if (decision.verdict === 'ESCALATE') {
        // Create review ticket
        const ticket = await this.reviewService.escalate(decision, redactedRequest);
        escalationTicketId = ticket.id;
      }

      // 5. Update Audit Trail & Recalculate Hash Chain
      const updatedAuditRecord = await this.auditService.updateRecordAndRecalculate(requestId, {
        decisionRecord: decision,
        validationResult, // Passing validation results
        executionResult: executionResult || undefined,
        parsedRequest: redactedRequest,
      });

      // 6. Trigger Webhook notifications
      const rulesTriggered = validationResult.failures.map((f) => {
        const name = f.rule.toLowerCase();
        if (name.includes('time') || name.includes('window')) return 'REG_F_TIME_WINDOW';
        if (name.includes('calls') || name.includes('frequency')) return 'REG_F_FREQUENCY';
        if (name.includes('cease')) return 'REG_F_CEASE_CONTACT';
        if (name.includes('bankruptcy')) return 'BANKRUPTCY_HOLD';
        return f.rule;
      });

      await this.notifier.notifyVerdict({
        event: 'VERDICT_ISSUED',
        requestId: redactedRequest.id,
        agentId: redactedRequest.agentId,
        verdict: decision.verdict,
        timestamp: new Date().toISOString(),
        riskScore: decision.riskScore,
        reasoning: decision.reasoning,
        validationFailures: validationResult.failures,
        escalationTicketId,
      });

      // 7. Record Metrics
      const duration = performance.now() - startTime;
      await this.metricsService.recordRequest(duration, success);

      this.logger.log(`Successfully completed queued compliance check job: ${requestId} (Verdict: ${decision.verdict})`);
    } catch (error: any) {
      success = false;
      this.logger.error(`Failed to process queued compliance check job: ${requestId}. Error: ${error.message}`);
      
      const duration = performance.now() - startTime;
      await this.metricsService.recordRequest(duration, success);

      // Save a failure status block into the audit trail
      const failureDecision: Decision = {
        verdict: 'BLOCK',
        requestId,
        timestamp: new Date(),
        riskScore: 1.0,
        reasoning: `Internal processing error: ${error.message}`,
      };
      
      try {
        await this.auditService.updateRecordAndRecalculate(requestId, {
          decisionRecord: failureDecision,
          validationResult: {
            passed: false,
            failures: [{ rule: 'SYSTEM_ERROR', reason: error.message, severity: 'CRITICAL' }],
            riskScore: 1.0,
            validationTime: duration,
            checks: [],
          },
        });
      } catch (err: any) {
        this.logger.error(`Critical: Failed to save fallback failure block to audit trail: ${err.message}`);
      }
    }
  }
}
