import { Module } from '@nestjs/common';
import { RequestExecutor } from './executor.service';
import { NotifierService } from './notifier.service';
import { MetricsService } from './metrics.service';

@Module({
  providers: [RequestExecutor, NotifierService, MetricsService],
  exports: [RequestExecutor, NotifierService, MetricsService],
})
export class IntegrationModule {}
