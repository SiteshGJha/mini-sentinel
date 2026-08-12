import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { RawRequest, ParsedRequest } from '../types';

@Injectable()
export class JobQueueService {
  private readonly queueName = 'pii_compliance_jobs';

  constructor(private readonly redisService: RedisService) {}

  async addJob(requestId: string, rawRequest: RawRequest, parsedRequest: ParsedRequest): Promise<void> {
    const redis = this.redisService.getClient();
    const payload = JSON.stringify({
      requestId,
      rawRequest,
      parsedRequest,
      queuedAt: new Date().toISOString(),
    });
    await redis.lpush(this.queueName, payload);
  }
}
