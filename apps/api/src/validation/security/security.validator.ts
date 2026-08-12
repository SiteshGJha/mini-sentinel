import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '../../config/configuration.service';
import { ParsedRequest, ValidationCheck, ValidationFailure } from '../../common/types';

@Injectable()
export class SecurityValidator {
  private injectionPatterns = [
    /ignore\s+previous\s+instructions/i,
    /system:\s*you\s+are\s+now\s+in\s+developer\s+mode/i,
    /human:\s*please\s+override\s+safety\s+protocols/i,
    /disregard\s+all\s+previous\s+instructions/i,
    /bypass\s+safety\s+filters/i,
    /assistant:\s*ignore\s+safety/i,
  ];

  private contentBoundaries = {
    maxLength: 10000,
    allowedChars: /^[\x20-\x7E\n\r\t]*$/, // Printable ASCII + newlines/tabs
    maxNesting: 5,
    maxArraySize: 100,
  };

  constructor(private configService: ConfigurationService) {}

  validate(request: ParsedRequest): {
    passed: boolean;
    checks: ValidationCheck[];
    failures: ValidationFailure[];
    riskScore: number;
  } {
    const startTime = performance.now();
    const failures: ValidationFailure[] = [];
    const securitySettings = this.configService.get<any>('security_settings', {
      enablePromptInjectionDetection: true,
      maxRequestSizeBytes: 1048576,
      requireRequestSignatures: false,
    });

    const checksPerformed: { name: string; status: 'PASS' | 'FAIL'; details: any }[] = [];

    // 1. Check for request size
    const requestSize = Buffer.byteLength(JSON.stringify(request.raw));
    const maxSize = securitySettings.maxRequestSizeBytes || this.contentBoundaries.maxLength;
    if (requestSize > maxSize) {
      failures.push({
        rule: 'REQUEST_SIZE_LIMIT',
        reason: `Request size of ${requestSize} bytes exceeds the maximum allowed limit of ${maxSize} bytes.`,
        severity: 'CRITICAL',
      });
      checksPerformed.push({ name: 'Request Size Check', status: 'FAIL', details: { requestSize, maxSize } });
    } else {
      checksPerformed.push({ name: 'Request Size Check', status: 'PASS', details: { requestSize, maxSize } });
    }

    // 2. Check for signature if required
    if (securitySettings.requireRequestSignatures && !request.raw.signature) {
      failures.push({
        rule: 'SIGNATURE_REQUIRED',
        reason: 'Cryptographic signature is required but missing from the request.',
        severity: 'CRITICAL',
      });
      checksPerformed.push({ name: 'Signature Check', status: 'FAIL', details: { required: true, present: false } });
    } else {
      checksPerformed.push({ name: 'Signature Check', status: 'PASS', details: { required: securitySettings.requireRequestSignatures } });
    }

    // 3. Scan for prompt injection attacks and validate characters
    if (securitySettings.enablePromptInjectionDetection) {
      const issues: string[] = [];
      const hasInvalidChars = false;

      const scanParams = (obj: any, currentDepth: number): void => {
        if (currentDepth > this.contentBoundaries.maxNesting) {
          failures.push({
            rule: 'EXCESSIVE_NESTING',
            reason: `Parameters nesting depth exceeds maximum limit of ${this.contentBoundaries.maxNesting}`,
            severity: 'HIGH',
          });
          return;
        }

        if (obj === null || obj === undefined) return;

        if (typeof obj === 'string') {
          // Check prompt injection
          for (const pattern of this.injectionPatterns) {
            if (pattern.test(obj)) {
              issues.push(`Prompt injection pattern '${pattern.source}' matched in value: "${obj}"`);
            }
          }

          // Check non-printable chars
          if (!this.contentBoundaries.allowedChars.test(obj)) {
            issues.push(`Non-printable or control characters found in string parameters.`);
          }
        } else if (Array.isArray(obj)) {
          if (obj.length > this.contentBoundaries.maxArraySize) {
            failures.push({
              rule: 'EXCESSIVE_ARRAY_SIZE',
              reason: `Array size ${obj.length} exceeds limit of ${this.contentBoundaries.maxArraySize}`,
              severity: 'HIGH',
            });
          }
          obj.forEach((item) => scanParams(item, currentDepth + 1));
        } else if (typeof obj === 'object') {
          for (const [key, value] of Object.entries(obj)) {
            // Also check key names for safety
            if (!this.contentBoundaries.allowedChars.test(key)) {
              issues.push(`Non-printable characters found in parameter key: "${key}"`);
            }
            scanParams(value, currentDepth + 1);
          }
        }
      };

      scanParams(request.parameters, 1);

      if (issues.length > 0) {
        failures.push({
          rule: 'PROMPT_INJECTION_OR_CHAR_VIOLATION',
          reason: issues.join(' | '),
          severity: 'HIGH',
        });
        checksPerformed.push({ name: 'Content Boundary Check', status: 'FAIL', details: { issues } });
      } else {
        checksPerformed.push({ name: 'Content Boundary Check', status: 'PASS', details: { status: 'Clean' } });
      }
    }

    // Risk score calculation based on failures
    const riskScore = failures.length > 0 ? (failures.some((f) => f.severity === 'CRITICAL') ? 1.0 : 0.8) : 0.0;

    const validationChecks: ValidationCheck[] = checksPerformed.map((cp, idx) => ({
      id: `sec_${idx}`,
      type: 'SECURITY_VALIDATION',
      name: cp.name,
      description: `Verify system security boundary: ${cp.name}`,
      status: cp.status === 'PASS' ? 'PASS' : 'FAIL',
      result: cp.details,
      durationMs: (performance.now() - startTime) / checksPerformed.length,
    }));

    return {
      passed: failures.length === 0,
      checks: validationChecks,
      failures,
      riskScore,
    };
  }
}
