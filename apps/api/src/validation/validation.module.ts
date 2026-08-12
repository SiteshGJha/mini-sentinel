import { Module } from '@nestjs/common';
import { PiiDetector } from './pii/pii.detector';
import { PiiRedactor } from './pii/pii.redactor';
import { RuleEngine } from './compliance/rule.engine';
import { SecurityValidator } from './security/security.validator';
import { ValidationPipeline } from './validation.pipeline';

@Module({
  providers: [
    PiiDetector,
    PiiRedactor,
    RuleEngine,
    SecurityValidator,
    ValidationPipeline,
  ],
  exports: [ValidationPipeline],
})
export class ValidationModule {}
