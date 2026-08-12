import { Module } from '@nestjs/common';
import { DecisionEngine } from './decision.engine';

@Module({
  providers: [DecisionEngine],
  exports: [DecisionEngine],
})
export class DecisionModule {}
