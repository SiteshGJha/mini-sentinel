import { Controller, Post, Get, Param, Body, Res, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ParserService } from '../interceptors/parsing/parser.service';
import { ValidationPipeline } from '../validation/validation.pipeline';
import { DecisionEngine } from '../decision/decision.engine';
import { AuditService } from '../audit/audit.service';
import { ReviewService } from '../workflow/review.service';
import { RequestExecutor } from '../integration/executor.service';
import { NotifierService } from '../integration/notifier.service';
import { MetricsService } from '../integration/metrics.service';
import { ConfigurationService } from '../config/configuration.service';
import { AiClassifierService } from '../ai/classifier.service';
import { JobQueueService } from '../common/queue/job.queue.service';
import { PrismaService } from '../common/prisma.service';
import { ParsedRequest } from '../common/types';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Gateway')
@Controller()
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(
    private parser: ParserService,
    private validationPipeline: ValidationPipeline,
    private decisionEngine: DecisionEngine,
    private auditService: AuditService,
    private reviewService: ReviewService,
    private executor: RequestExecutor,
    private notifier: NotifierService,
    private metricsService: MetricsService,
    private configService: ConfigurationService,
    private aiClassifier: AiClassifierService,
    private jobQueueService: JobQueueService,
    private prisma: PrismaService,
  ) {}

  @Post(['api/v1/intercept', 'v1/intercept'])
  @ApiOperation({ summary: 'Intercept and evaluate agent tool execution request against compliance policies (Asynchronous)' })
  @ApiResponse({ status: 202, description: 'Request received and queued. Returns request ID, status, and polling URL.' })
  async intercept(@Body() rawBody: any, @Res() reply: FastifyReply) {
    const startTime = performance.now();
    try {
      // 1. Parse Request
      const parsedRequest = this.parser.parse(rawBody);

      // 2. Record initial PENDING audit block in the chain
      const initialValidationResult = {
        passed: false,
        failures: [],
        riskScore: 0.0,
        validationTime: 0,
        checks: [],
      };
      const initialDecision = {
        verdict: 'PENDING' as any,
        requestId: parsedRequest.id,
        timestamp: new Date(),
        riskScore: 0.0,
        reasoning: 'Queued for processing',
      };

      await this.auditService.record(
        rawBody,
        parsedRequest,
        initialValidationResult,
        initialDecision,
      );

      // 3. Enqueue job
      await this.jobQueueService.addJob(parsedRequest.id, rawBody, parsedRequest);

      const duration = performance.now() - startTime;
      await this.metricsService.recordRequest(duration, true);

      // 4. Return 202 Accepted
      return reply.status(HttpStatus.ACCEPTED).send({
        requestId: parsedRequest.id,
        status: 'PENDING',
        message: 'Request successfully received and queued for compliance checks.',
        pollingUrl: `/api/v1/status/${parsedRequest.id}`,
      });
    } catch (error: any) {
      const duration = performance.now() - startTime;
      await this.metricsService.recordRequest(duration, false);

      return reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        verdict: 'BLOCK',
        reasoning: `Internal processing error: ${error.message}`,
        error: error.message,
        timestamp: new Date(),
      });
    }
  }

  @Get(['api/v1/status/:requestId', 'v1/status/:requestId'])
  @ApiOperation({ summary: 'Query the compliance execution status of a queued request' })
  @ApiResponse({ status: 200, description: 'Returns the current status of the request (PENDING or COMPLETED with full details).' })
  async getStatus(@Param('requestId') requestId: string, @Res() reply: FastifyReply) {
    const record = await this.prisma.auditRecord.findUnique({
      where: { requestId },
      include: { reviewTicket: true },
    });

    if (!record) {
      throw new NotFoundException(`Request with ID ${requestId} not found`);
    }

    const decisionRecord = record.decisionRecord as any;
    if (decisionRecord?.verdict === 'PENDING') {
      return reply.status(HttpStatus.OK).send({
        requestId,
        status: 'PENDING',
        message: 'Compliance check is currently processing in the background.',
      });
    }

    // Map rulesTriggered list
    const validationResult = record.validationResult as any;
    const rulesTriggered = validationResult?.failures?.map((f: any) => {
      const name = f.rule.toLowerCase();
      if (name.includes('time') || name.includes('window')) return 'REG_F_TIME_WINDOW';
      if (name.includes('calls') || name.includes('frequency')) return 'REG_F_FREQUENCY';
      if (name.includes('cease')) return 'REG_F_CEASE_CONTACT';
      if (name.includes('bankruptcy')) return 'BANKRUPTCY_HOLD';
      return f.rule;
    }) || [];

    const isObserveOverride = decisionRecord?.reasoning?.includes('[OBSERVE ONLY OVERRIDE]') || false;

    // Map status string
    let status = 'COMPLETED';
    if (decisionRecord?.verdict === 'ESCALATE') {
      status = 'ESCALATED';
    } else if (decisionRecord?.verdict === 'BLOCK') {
      status = 'REJECTED';
    }

    const parsedRequest = record.parsedRequest as any;

    return reply.status(HttpStatus.OK).send({
      requestId: record.requestId,
      status,
      verdict: decisionRecord?.verdict,
      timestamp: record.completedAt,
      reasoning: decisionRecord?.reasoning,
      reason: decisionRecord?.reasoning, // alias
      riskScore: decisionRecord?.riskScore,
      validationSummary: decisionRecord?.validationSummary,
      escalationTicketId: record.reviewTicket?.id || decisionRecord?.escalationTicketId || undefined,
      processingTimeMs: new Date(record.completedAt).getTime() - new Date(record.receivedAt).getTime(),
      redactedParameters: requestRequiresRedaction(parsedRequest) ? parsedRequest?.parameters : undefined,
      executionResult: record.executionResult || undefined,
      rulesTriggered,
      rules_triggered: rulesTriggered, // alias
      auditHash: record.hash,
      observeOverride: isObserveOverride,
      aiClassification: parsedRequest?.parameters?.aiClassification || undefined,
    });
  }

  @Post(['api/v1/classify', 'v1/classify'])
  @ApiOperation({ summary: 'Classify agent outreach message intent using real LLM or regex keyword heuristics' })
  @ApiResponse({ status: 200, description: 'Message intent analyzed and classified successfully.' })
  async classify(@Body() body: { message: string }, @Res() reply: FastifyReply) {
    if (!body || !body.message) {
      return reply.status(HttpStatus.BAD_REQUEST).send({ error: 'Message body is required.' });
    }
    const classification = await this.aiClassifier.classify(body.message);
    return reply.status(HttpStatus.OK).send({ classification });
  }
}

function requestRequiresRedaction(req: any): boolean {
  return req?.tool?.requiresPiiRedaction || false;
}
