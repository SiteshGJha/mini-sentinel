import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '../config/configuration.service';
import { ParsedRequest, ValidationResult, Decision, Verdict, DecisionReasoning } from '../common/types';

@Injectable()
export class DecisionEngine {
  constructor(private configService: ConfigurationService) {}

  decide(request: ParsedRequest, validationResult: ValidationResult): Decision {
    const riskThresholds = this.configService.get<{ escalate: number; block: number }>('risk_thresholds', {
      escalate: 0.7,
      block: 0.9,
    });

    let verdict: Verdict = 'APPROVE';
    const factors: DecisionReasoning['factors'] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 1. Calculate risk factors based on request properties
    let baseRiskScore = validationResult.riskScore;

    // Tool risk contribution
    if (request.tool.riskLevel === 'CRITICAL') {
      baseRiskScore = Math.max(baseRiskScore, 0.85);
      factors.push({
        type: 'RISK_THRESHOLD',
        description: 'Tool risk level is CRITICAL',
        impact: 'NEGATIVE',
        weight: 0.4,
        value: 'CRITICAL',
      });
    } else if (request.tool.riskLevel === 'HIGH') {
      baseRiskScore = Math.max(baseRiskScore, 0.7);
      factors.push({
        type: 'RISK_THRESHOLD',
        description: 'Tool risk level is HIGH',
        impact: 'NEGATIVE',
        weight: 0.25,
        value: 'HIGH',
      });
    }

    // High transaction amount contribution (e.g. process-payment with amount > 5000)
    const cost = request.action.costEstimate;
    if (cost && cost > 5000) {
      baseRiskScore = Math.max(baseRiskScore, 0.8);
      factors.push({
        type: 'COST_IMPACT',
        description: `High financial transaction value: $${cost}`,
        impact: 'NEGATIVE',
        weight: 0.3,
        value: cost,
      });
    }

    // 2. Assess validation check statuses
    const failedChecks = validationResult.checks.filter((c) => c.status === 'FAIL');
    const warningChecks = validationResult.checks.filter((c) => c.status === 'WARNING');

    // 3. Determine Verdict based on failure actions or risk score thresholds
    const rules = this.configService.getRules();
    let hasBlockFailure = false;
    let hasEscalateFailure = false;

    for (const c of failedChecks) {
      const correspondingRule = rules.find((r) => r.id === c.ruleId || r.name === c.name);
      if (correspondingRule) {
        if (correspondingRule.action === 'BLOCK') {
          hasBlockFailure = true;
        } else if (correspondingRule.action === 'ESCALATE') {
          hasEscalateFailure = true;
        }
      } else {
        // Default security or parse check failure requires BLOCK
        hasBlockFailure = true;
      }
    }

    if (hasBlockFailure) {
      verdict = 'BLOCK';
      failedChecks.forEach((c) => {
        factors.push({
          type: 'COMPLIANCE_VIOLATION',
          description: `Validation check '${c.name}' failed: ${c.error || 'Constraint mismatch'}`,
          impact: 'NEGATIVE',
          weight: 0.9,
          value: c.result,
        });
      });
    } else if (hasEscalateFailure) {
      verdict = 'ESCALATE';
      failedChecks.forEach((c) => {
        factors.push({
          type: 'COMPLIANCE_VIOLATION',
          description: `Validation check '${c.name}' flagged for escalation: ${c.error || 'Triggered policy review'}`,
          impact: 'NEGATIVE',
          weight: 0.75,
          value: c.result,
        });
      });
    } else if (baseRiskScore >= riskThresholds.block) {
      verdict = 'BLOCK';
      factors.push({
        type: 'RISK_THRESHOLD',
        description: `Aggregate risk score (${baseRiskScore.toFixed(2)}) exceeds block threshold (${riskThresholds.block})`,
        impact: 'NEGATIVE',
        weight: 1.0,
        value: baseRiskScore,
      });
    } else if (baseRiskScore >= riskThresholds.escalate) {
      verdict = 'ESCALATE';
      factors.push({
        type: 'RISK_THRESHOLD',
        description: `Aggregate risk score (${baseRiskScore.toFixed(2)}) exceeds escalation threshold (${riskThresholds.escalate})`,
        impact: 'NEGATIVE',
        weight: 0.8,
        value: baseRiskScore,
      });
    } else {
      verdict = 'APPROVE';
      factors.push({
        type: 'OPERATIONAL_RISK',
        description: 'All validation checks successfully passed within standard parameters.',
        impact: 'POSITIVE',
        weight: 0.9,
        value: 'Passed',
      });
    }

    // 4. Generate summary and recommendations
    let summary = '';
    if (verdict === 'APPROVE') {
      summary = 'Request approved. All security and compliance validation checks passed.';
      recommendations.push('Proceed with tool execution immediately.');
    } else if (verdict === 'BLOCK') {
      summary = `Request blocked due to compliance/security violations.`;
      if (failedChecks.length > 0) {
        const failureDetails = failedChecks.map(c => {
          const rule = rules.find((r) => r.id === c.ruleId || r.name === c.name);
          return (rule?.actionParams as any)?.message || c.error || c.result?.reason || `Rule '${c.name}' failed`;
        }).join(', ');
        summary = `Request blocked: ${failureDetails}`;
      }
      recommendations.push('Review parameter values and re-submit with valid compliance data.');
      failedChecks.forEach((c) => warnings.push(`${c.name} violation`));
    } else if (verdict === 'ESCALATE') {
      summary = `Request escalated to human review. The operation triggered a compliance flag or exceeds risk threshold (${baseRiskScore.toFixed(2)}).`;
      if (failedChecks.length > 0) {
        const escalationDetails = failedChecks.map(c => {
          const rule = rules.find((r) => r.id === c.ruleId || r.name === c.name);
          return (rule?.actionParams as any)?.message || c.error || c.result?.reason || `Rule '${c.name}' flagged`;
        }).join(', ');
        summary = `Request escalated: ${escalationDetails}`;
      }
      recommendations.push('Await manual compliance officer validation before executing the tool.');
      warningChecks.forEach((c) => warnings.push(`${c.name} alert`));
    }

    const decisionReasoning: DecisionReasoning = {
      summary,
      factors,
      recommendations,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    return {
      verdict,
      requestId: request.id,
      timestamp: new Date(),
      riskScore: baseRiskScore,
      reasoning: summary,
      reasoningDetails: decisionReasoning,
      validationSummary: {
        totalChecks: validationResult.checks.length,
        passedChecks: validationResult.checks.filter((c) => c.status === 'PASS').length,
        failedChecks: failedChecks.length,
        failures: validationResult.failures,
      },
    };
  }
}
