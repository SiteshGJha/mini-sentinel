import { Module } from '@nestjs/common';
import { AiClassifierService } from './classifier.service';

@Module({
  providers: [AiClassifierService],
  exports: [AiClassifierService],
})
export class AiModule {}
