import { Injectable, Logger } from '@nestjs/common';
import { ConfigurationService } from '../config/configuration.service';
import { Verdict, ValidationFailure } from '../common/types';

export interface VerdictWebhookPayload {
  event: 'VERDICT_ISSUED';
  requestId: string;
  agentId: string;
  verdict: Verdict;
  timestamp: string;
  riskScore: number;
  reasoning: string;
  validationFailures?: ValidationFailure[];
  escalationTicketId?: string;
}

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);
  private webhookLogs: VerdictWebhookPayload[] = [];

  constructor(private configService: ConfigurationService) {}

  async notifyVerdict(payload: VerdictWebhookPayload): Promise<void> {
    this.webhookLogs.push(payload);
    const webhookUrls = this.configService.get<string[]>('webhook_urls', []);

    this.logger.log(
      `Dispatching Webhook: Request ${payload.requestId} -> Verdict ${payload.verdict}. Triggered events: ${webhookUrls.length} urls.`,
    );

    for (const url of webhookUrls) {
      try {
        // Use standard fetch if available (Node 18+)
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          this.logger.warn(`Failed webhook delivery to ${url}: ${response.statusText}`);
        }
      } catch (err: any) {
        this.logger.warn(`Skipping actual HTTP fetch to ${url} (Sandbox / Network restrictions active: ${err.message})`);
      }
    }
  }

  getWebhookLogs(): VerdictWebhookPayload[] {
    return this.webhookLogs;
  }

  clearLogs() {
    this.webhookLogs = [];
  }
}
