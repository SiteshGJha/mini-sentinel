import { Global, Module } from '@nestjs/common';
import { JobQueueService } from './job.queue.service';
import { JobWorkerService } from './job.worker.service';
import { ValidationModule } from '../../validation/validation.module';
import { DecisionModule } from '../../decision/decision.module';
import { AuditModule } from '../../audit/audit.module';
import { WorkflowModule } from '../../workflow/workflow.module';
import { IntegrationModule } from '../../integration/integration.module';
import { ConfigurationModule } from '../../config/configuration.module';
import { AiModule } from '../../ai/ai.module';

@Global()
@Module({
  imports: [
    ValidationModule,
    DecisionModule,
    AuditModule,
    WorkflowModule,
    IntegrationModule,
    ConfigurationModule,
    AiModule,
  ],
  providers: [JobQueueService, JobWorkerService],
  exports: [JobQueueService, JobWorkerService],
})
export class QueueModule {}
