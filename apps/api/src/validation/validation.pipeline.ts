import { Injectable } from '@nestjs/common';
import { ParsedRequest, ValidationResult, ValidationCheck, ValidationFailure } from '../common/types';
import { PiiRedactor } from './pii/pii.redactor';
import { RuleEngine } from './compliance/rule.engine';
import { SecurityValidator } from './security/security.validator';

@Injectable()
export class ValidationPipeline {
  constructor(
    private piiRedactor: PiiRedactor,
    private ruleEngine: RuleEngine,
    private securityValidator: SecurityValidator,
  ) {}

  async validate(request: ParsedRequest): Promise<{
    result: ValidationResult;
    redactedRequest: ParsedRequest;
  }> {
    const startTime = performance.now();
    const checks: ValidationCheck[] = [];
    const failures: ValidationFailure[] = [];
    let riskScore = 0.0;

    // 1. If parsing errors exist, fail fast
    if (request.parseErrors && request.parseErrors.length > 0) {
      const parseFailures: ValidationFailure[] = request.parseErrors.map((err) => ({
        rule: 'REQUEST_PARSING',
        reason: err,
        severity: 'CRITICAL',
      }));

      const duration = performance.now() - startTime;
      return {
        result: {
          passed: false,
          failures: parseFailures,
          riskScore: 1.0,
          validationTime: duration,
          checks: [
            {
              id: 'parse_err',
              type: 'SCHEMA_VALIDATION',
              name: 'Request Parsing & Schema Validation',
              description: 'Validates input JSON parameters against Zod schema',
              status: 'FAIL',
              result: { parseErrors: request.parseErrors },
              durationMs: duration,
            },
          ],
        },
        redactedRequest: request,
      };
    }

    let redactedRequest = { ...request };

    // 2. Run PII Redaction if required
    if (request.tool.requiresPiiRedaction) {
      const piiStart = performance.now();
      const { redactedParams, redactedCount, matches } = await this.piiRedactor.redactParametersAsync(request.parameters);
      redactedRequest.parameters = redactedParams;

      checks.push({
        id: 'pii_redact',
        type: 'PII_REDACTION',
        name: 'PII Detection & Redaction',
        description: 'Scan and redact SSN, Credit Cards, Bank Accounts, and Addresses',
        status: redactedCount > 0 ? 'WARNING' : 'PASS',
        result: { redactedCount, matches },
        durationMs: performance.now() - piiStart,
      });

      if (redactedCount > 0) {
        // PII matches don't necessarily BLOCK the request if they were successfully redacted,
        // but we record the risk score contribution.
        riskScore = Math.max(riskScore, 0.1);
      }
    } else {
      checks.push({
        id: 'pii_redact',
        type: 'PII_REDACTION',
        name: 'PII Detection & Redaction',
        description: 'PII scan skipped (not required for this tool)',
        status: 'SKIPPED',
        result: null,
        durationMs: 0,
      });
    }

    // 3. Run Compliance Rules if required
    if (request.tool.requiresComplianceCheck) {
      const complianceStart = performance.now();
      const complianceResult = await this.ruleEngine.evaluate(request);
      checks.push(...complianceResult.checks);
      failures.push(...complianceResult.failures);

      if (!complianceResult.passed) {
        // Determine compliance risk score contribution
        const hasCritical = complianceResult.failures.some((f) => f.severity === 'CRITICAL');
        const hasHigh = complianceResult.failures.some((f) => f.severity === 'HIGH');
        riskScore = Math.max(riskScore, hasCritical ? 0.95 : hasHigh ? 0.75 : 0.4);
      }
    } else {
      checks.push({
        id: 'compliance_rules',
        type: 'REG_F_COMPLIANCE',
        name: 'Compliance Rules Evaluation',
        description: 'Compliance checks skipped (not required for this tool)',
        status: 'SKIPPED',
        result: null,
        durationMs: 0,
      });
    }

    // 4. Run Security Validation
    const securityStart = performance.now();
    const securityResult = this.securityValidator.validate(request);
    checks.push(...securityResult.checks);
    failures.push(...securityResult.failures);

    if (!securityResult.passed) {
      riskScore = Math.max(riskScore, securityResult.riskScore);
    }

    const totalDuration = performance.now() - startTime;

    return {
      result: {
        passed: failures.length === 0,
        failures,
        riskScore,
        validationTime: totalDuration,
        checks,
      },
      redactedRequest,
    };
  }
}
