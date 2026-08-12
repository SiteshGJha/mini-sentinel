import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigurationModule } from './config/configuration.module';
import { ValidationModule } from './validation/validation.module';
import { DecisionModule } from './decision/decision.module';
import { AuditModule } from './audit/audit.module';
import { WorkflowModule } from './workflow/workflow.module';
import { IntegrationModule } from './integration/integration.module';
import { AiModule } from './ai/ai.module';
import { GatewayController } from './api/gateway.controller';
import { AdminController } from './api/admin.controller';
import { ParserService } from './interceptors/parsing/parser.service';
import { DatabaseModule } from './common/database/database.module';
import { PiiClientModule } from './common/pii-client/pii-client.module';
import { QueueModule } from './common/queue/queue.module';

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    PiiClientModule,
    QueueModule,
    ConfigurationModule,
    ValidationModule,
    DecisionModule,
    AuditModule,
    WorkflowModule,
    IntegrationModule,
    AiModule,
  ],
  controllers: [GatewayController, AdminController],
  providers: [ParserService],
})
export class AppModule {}
