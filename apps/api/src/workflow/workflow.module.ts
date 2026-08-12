import { Module } from '@nestjs/common';
import { ReviewService } from './review.service';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [IntegrationModule, AuditModule],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class WorkflowModule {}
