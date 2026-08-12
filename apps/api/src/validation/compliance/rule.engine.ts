import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ParsedRequest, ValidationCheck, ValidationFailure } from '../../common/types';
import { ComplianceRule, RuleOperator, RuleType, RuleAction } from '@prisma/client';

@Injectable()
export class RuleEngine {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigurationService,
  ) {}

  async evaluate(request: ParsedRequest): Promise<{
    passed: boolean;
    checks: ValidationCheck[];
    failures: ValidationFailure[];
  }> {
    const checks: ValidationCheck[] = [];
    const failures: ValidationFailure[] = [];
    const rules = this.configService.getRules();

    // Parameter Normalization for Collections Outreach Governance
    const params = request.parameters || {};
    if (params.contactAttemptsLast7Days !== undefined && params.calls_last_7_days === undefined) {
      params.calls_last_7_days = Number(params.contactAttemptsLast7Days);
    }
    if (params.localTime !== undefined && params.contact_hour_local === undefined) {
      if (typeof params.localTime === 'string') {
        const hr = parseInt(params.localTime.split(':')[0], 10);
        if (!isNaN(hr)) {
          params.contact_hour_local = hr;
        }
      } else if (typeof params.localTime === 'number') {
        params.contact_hour_local = params.localTime;
      }
    }
    if (params.ceaseContact !== undefined && params.cease_communication_requested === undefined) {
      params.cease_communication_requested = !!params.ceaseContact;
    }
    if (params.bankruptcyHold !== undefined && params.bankruptcy_hold === undefined) {
      params.bankruptcy_hold = !!params.bankruptcyHold;
    }

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const startTime = performance.now();
      let status: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
      let errorMsg: string | undefined;
      let checkResult: any = null;

      try {
        if (rule.type === RuleType.REG_F || rule.name.toLowerCase().includes('bankruptcy')) {
          if (request.tool.name !== 'dialer') {
            status = 'PASS';
            checkResult = { message: 'Skipped: Collections rule only applies to dialer tool.' };
          } else {
            const regFResult = await this.evaluateRegF(request, rule);
            status = regFResult.passed ? 'PASS' : 'FAIL';
            checkResult = regFResult.details;
            if (!regFResult.passed) {
              failures.push({
                rule: rule.name,
                reason: regFResult.reason,
                severity: 'HIGH',
              });
            }
          }
        } else if (rule.conditions && Array.isArray(rule.conditions)) {
          const ruleName = rule.name.toLowerCase();
          if ((ruleName.includes('dti') || ruleName.includes('credit score') || ruleName.includes('employment')) && request.tool.name !== 'loan-underwriter') {
            status = 'PASS';
            checkResult = { message: `Skipped: Underwriting rule '${rule.name}' only applies to loan-underwriter.` };
          } else {
            const sampleResult = this.evaluateSampleRuleConditions(request, rule);
            status = sampleResult.passed ? 'PASS' : 'FAIL';
            checkResult = sampleResult.details;
            if (!sampleResult.passed) {
              failures.push({
                rule: rule.name,
                reason: sampleResult.reason,
                severity: rule.action === RuleAction.BLOCK ? 'HIGH' : 'MEDIUM',
              });
            }
          }
        } else if (rule.type === RuleType.QM) {
          if (request.tool.name !== 'loan-underwriter') {
            status = 'PASS';
            checkResult = { message: 'Skipped: QM rule only applies to loan-underwriter.' };
          } else {
            const qmResult = this.evaluateQM(request, rule);
            status = qmResult.passed ? 'PASS' : 'FAIL';
            checkResult = qmResult.details;
            if (!qmResult.passed) {
              failures.push({
                rule: rule.name,
                reason: qmResult.reason,
                severity: 'CRITICAL',
              });
            }
          }
        } else if (rule.type === RuleType.OFAC) {
          const ofacResult = this.evaluateOFAC(request, rule);
          status = ofacResult.passed ? 'PASS' : 'FAIL';
          checkResult = ofacResult.details;
          if (!ofacResult.passed) {
            failures.push({
              rule: rule.name,
              reason: ofacResult.reason,
              severity: 'CRITICAL',
            });
          }
        } else {
          // Generic rule evaluation based on field and operator
          const genericResult = this.evaluateGeneric(request, rule);
          status = genericResult.passed ? 'PASS' : 'FAIL';
          checkResult = genericResult.details;
          if (!genericResult.passed) {
            failures.push({
              rule: rule.name,
              reason: genericResult.reason,
              severity: 'MEDIUM',
            });
          }
        }
      } catch (err: any) {
        status = 'ERROR';
        errorMsg = err.message || 'Error executing rule';
        failures.push({
          rule: rule.name,
          reason: `Execution Error: ${errorMsg}`,
          severity: 'HIGH',
        });
      }

      checks.push({
        id: rule.id,
        type: this.mapRuleTypeToValidationType(rule.type),
        name: rule.name,
        description: rule.description || '',
        status,
        result: checkResult,
        error: errorMsg,
        durationMs: performance.now() - startTime,
        ruleId: rule.id,
      });
    }

    return {
      passed: failures.length === 0,
      checks,
      failures,
    };
  }

  private mapRuleTypeToValidationType(type: RuleType) {
    switch (type) {
      case RuleType.REG_F: return 'REG_F_COMPLIANCE';
      case RuleType.QM: return 'QM_COMPLIANCE';
      case RuleType.OFAC: return 'OFAC_COMPLIANCE';
      case RuleType.PII: return 'PII_REDACTION';
      case RuleType.SECURITY: return 'SECURITY_VALIDATION';
      default: return 'BUSINESS_LOGIC';
    }
  }

  // Sample Rules Dynamic Conditions Evaluator
  private evaluateSampleRuleConditions(
    request: ParsedRequest,
    rule: ComplianceRule,
  ): { passed: boolean; reason: string; details: any } {
    const conditions = rule.conditions as any[];
    const failDetails = (rule.actionParams as any) || { message: 'Condition failed' };

    for (const cond of conditions) {
      const type = cond.type;
      const field = cond.field;

      if (type === 'threshold') {
        let val = this.getNestedValue(request, `parameters.${field}`);
        if (val === undefined && (field === 'debt_to_income_ratio' || field === 'dti')) {
          const monthlyIncome = this.getNestedValue(request, 'parameters.monthlyIncome');
          const monthlyDebt = this.getNestedValue(request, 'parameters.monthlyDebt');
          if (monthlyIncome && monthlyDebt) {
            val = monthlyDebt / monthlyIncome;
          }
        }
        if (val === undefined) {
          return { passed: false, reason: `Missing parameter: '${field}'`, details: cond };
        }
        const op = cond.operator;
        let targetVal = Number(cond.value);
        let parsedVal = Number(val);
        // Normalize percentage vs decimal formats
        if (targetVal < 1.0 && parsedVal > 1.0) {
          parsedVal = parsedVal / 100;
        } else if (targetVal > 1.0 && parsedVal < 1.0) {
          parsedVal = parsedVal * 100;
        }

        let ok = false;
        switch (op) {
          case 'gte': ok = parsedVal >= targetVal; break;
          case 'lte': ok = parsedVal <= targetVal; break;
          case 'gt': ok = parsedVal > targetVal; break;
          case 'lt': ok = parsedVal < targetVal; break;
          case 'eq': ok = parsedVal === targetVal; break;
          case 'neq': ok = parsedVal !== targetVal; break;
          default: ok = true;
        }

        if (!ok) {
          return {
            passed: false,
            reason: failDetails.message || `Field '${field}' failed threshold ${op} ${targetVal}.`,
            details: { field, val: parsedVal, op, targetVal },
          };
        }
      } else if (type === 'range') {
        const val = this.getNestedValue(request, `parameters.${field}`);
        if (val === undefined) {
          return { passed: false, reason: `Missing parameter: '${field}'`, details: cond };
        }
        const min = cond.min;
        const max = cond.max;
        const ok = Number(val) >= Number(min) && Number(val) <= Number(max);

        if (!ok) {
          return {
            passed: false,
            reason: failDetails.message || `Field '${field}' is outside range [${min}, ${max}].`,
            details: { field, val, min, max },
          };
        }
      } else if (type === 'expression') {
        const expr = cond.expression;
        let ok = true;

        if (expr === 'not cease_communication_requested') {
          const cease = this.getNestedValue(request, 'parameters.cease_communication_requested');
          ok = !cease;
        } else if (expr === 'not consumer_represented_by_attorney') {
          const represented = this.getNestedValue(request, 'parameters.consumer_represented_by_attorney');
          ok = !represented;
        } else if (expr === 'not third_party_recipient') {
          const thirdParty = this.getNestedValue(request, 'parameters.third_party_recipient');
          ok = !thirdParty;
        }

        if (!ok) {
          return {
            passed: false,
            reason: failDetails.message || `Expression constraint failed: ${expr}`,
            details: { expression: expr },
          };
        }
      }
    }

    return { passed: true, reason: '', details: { message: 'All conditions met.' } };
  }

  // Reg F Rules Dispatcher
  private async evaluateRegF(request: ParsedRequest, rule: ComplianceRule): Promise<{ passed: boolean; reason: string; details: any }> {
    const name = rule.name.toLowerCase();
    
    if (name.includes('time') || name.includes('window')) {
      return this.evaluateRegFTimeWindow(request, rule);
    }
    if (name.includes('calls') || name.includes('frequency')) {
      return this.evaluateRegFCallFrequency(request, rule);
    }
    if (name.includes('cease')) {
      return this.evaluateRegFCeaseContact(request, rule);
    }
    if (name.includes('bankruptcy')) {
      return this.evaluateBankruptcyHold(request, rule);
    }
    if (name.includes('cooldown')) {
      return this.evaluateRegFCooldown(request, rule);
    }
    if (name.includes('attorney') || name.includes('counsel')) {
      return this.evaluateRegFAttorney(request, rule);
    }
    if (name.includes('third party') || name.includes('third-party')) {
      return this.evaluateRegFThirdParty(request, rule);
    }
    
    return { passed: true, reason: '', details: { message: 'Skipped rule check' } };
  }

  private evaluateRegFTimeWindow(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const localTime = params.localTime || params.contact_hour_local;
    
    let hour = 12;
    let minute = 0;
    
    if (typeof localTime === 'string') {
      const parts = localTime.split(':');
      hour = parseInt(parts[0], 10);
      minute = parts[1] ? parseInt(parts[1], 10) : 0;
    } else if (typeof localTime === 'number') {
      hour = localTime;
    } else {
      const now = new Date();
      hour = now.getHours();
      minute = now.getMinutes();
    }
    
    const timeInMinutes = hour * 60 + minute;
    const minInMinutes = 8 * 60; // 08:00
    const maxInMinutes = 21 * 60; // 21:00
    
    const passed = timeInMinutes >= minInMinutes && timeInMinutes < maxInMinutes;
    
    return {
      passed,
      reason: passed ? '' : `Contact outside permitted hours (08:00 - 21:00). Actual: ${localTime}`,
      details: { localTime, hour, minute },
    };
  }

  private async evaluateRegFCallFrequency(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const customerId = params.customerId;
    if (!customerId) {
      return { passed: true, reason: '', details: { message: 'No customerId, frequency check skipped' } };
    }
    
    let count = 0;
    if (params.contactAttemptsLast7Days !== undefined) {
      count = Number(params.contactAttemptsLast7Days);
    } else if (params.calls_last_7_days !== undefined) {
      count = Number(params.calls_last_7_days);
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      count = await this.prisma.auditRecord.count({
        where: {
          receivedAt: { gte: sevenDaysAgo },
          decisionRecord: {
            path: ['verdict'],
            equals: 'APPROVE',
          },
          rawRequest: {
            path: ['parameters', 'customerId'],
            equals: String(customerId),
          },
        },
      });
    }
    
    const limit = (rule.value as number) || 7;
    const passed = count < limit;
    
    return {
      passed,
      reason: passed ? '' : `Reg F contact attempts limit of ${limit} exceeded. Actual: ${count} contact attempts.`,
      details: { contactCount: count, limit, customerId },
    };
  }

  private evaluateRegFCeaseContact(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const ceaseContact = params.ceaseContact !== undefined ? params.ceaseContact : params.cease_communication_requested;
    const passed = !ceaseContact;
    return {
      passed,
      reason: passed ? '' : 'Cease contact request is in force for this customer.',
      details: { ceaseContact },
    };
  }

  private evaluateBankruptcyHold(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const bankruptcyHold = params.bankruptcyHold !== undefined ? params.bankruptcyHold : params.bankruptcy_hold;
    const passed = !bankruptcyHold;
    return {
      passed,
      reason: passed ? '' : 'Bankruptcy hold is in force for this customer.',
      details: { bankruptcyHold },
    };
  }

  private evaluateRegFCooldown(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const daysSinceLastConv = params.days_since_last_conversation;
    const passed = daysSinceLastConv === undefined || Number(daysSinceLastConv) >= 7;
    return {
      passed,
      reason: passed ? '' : `7-day post-conversation cooldown in force. Days since last contact: ${daysSinceLastConv}`,
      details: { daysSinceLastConv },
    };
  }

  private evaluateRegFAttorney(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const represented = params.consumer_represented_by_attorney;
    const passed = !represented;
    return {
      passed,
      reason: passed ? '' : 'Consumer is represented by an attorney.',
      details: { represented },
    };
  }

  private evaluateRegFThirdParty(request: ParsedRequest, rule: ComplianceRule) {
    const params = request.parameters || {};
    const thirdParty = params.third_party_recipient;
    const passed = !thirdParty;
    return {
      passed,
      reason: passed ? '' : 'Debt disclosure to third parties is prohibited.',
      details: { thirdParty },
    };
  }

  // 2. QM DTI Ratio Checker
  private evaluateQM(request: ParsedRequest, rule: ComplianceRule) {
    let dti = this.getNestedValue(request, 'parameters.dti');

    if (dti === undefined) {
      const monthlyIncome = this.getNestedValue(request, 'parameters.monthlyIncome');
      const monthlyDebt = this.getNestedValue(request, 'parameters.monthlyDebt');
      if (monthlyIncome && monthlyDebt) {
        dti = (monthlyDebt / monthlyIncome) * 100;
      }
    }

    if (dti === undefined) {
      return { passed: true, reason: '', details: { message: 'No DTI or Debt/Income params provided, skipped check' } };
    }

    let parsedDti = parseFloat(dti);
    if (parsedDti > 0 && parsedDti < 1.0) {
      parsedDti *= 100;
    }

    const threshold = (rule.value as number) || 43.0;
    const passed = parsedDti <= threshold;

    return {
      passed,
      reason: passed ? '' : `Qualified Mortgage DTI threshold of ${threshold}% exceeded (Actual: ${parsedDti.toFixed(2)}%)`,
      details: { dti: parsedDti, threshold },
    };
  }

  // 3. OFAC Sanctions Checker
  private evaluateOFAC(request: ParsedRequest, rule: ComplianceRule) {
    const fullName = this.getNestedValue(request, rule.field || 'parameters.fullName');
    if (!fullName || typeof fullName !== 'string') {
      return { passed: true, reason: '', details: { message: 'No fullName provided, skipped OFAC check' } };
    }

    const sanctionedNames: string[] = this.configService.get('ofac_sanctions', []);
    const normalizedQuery = fullName.toUpperCase().trim();

    const isSanctioned = sanctionedNames.some((name) => {
      const normalizedName = name.toUpperCase().trim();
      return normalizedQuery === normalizedName || normalizedQuery.includes(normalizedName);
    });

    return {
      passed: !isSanctioned,
      reason: !isSanctioned ? '' : `OFAC Sanction Match detected for name: ${fullName}`,
      details: { fullName, match: isSanctioned },
    };
  }

  // 4. Generic dynamic rule evaluator
  private evaluateGeneric(request: ParsedRequest, rule: ComplianceRule) {
    const value = this.getNestedValue(request, rule.field);
    const ruleVal = rule.value;
    let passed = false;

    if (value === undefined) {
      return { passed: true, reason: '', details: { message: `Field ${rule.field} not found, skipped` } };
    }

    switch (rule.operator) {
      case RuleOperator.EQUALS:
        passed = String(value) === String(ruleVal);
        break;
      case RuleOperator.NOT_EQUALS:
        passed = String(value) !== String(ruleVal);
        break;
      case RuleOperator.GREATER_THAN:
        passed = Number(value) > Number(ruleVal);
        break;
      case RuleOperator.LESS_THAN:
        passed = Number(value) < Number(ruleVal);
        break;
      case RuleOperator.GREATER_THAN_OR_EQUAL:
        passed = Number(value) >= Number(ruleVal);
        break;
      case RuleOperator.LESS_THAN_OR_EQUAL:
        passed = Number(value) <= Number(ruleVal);
        break;
      case RuleOperator.CONTAINS:
        passed = String(value).toLowerCase().includes(String(ruleVal).toLowerCase());
        break;
      case RuleOperator.NOT_CONTAINS:
        passed = !String(value).toLowerCase().includes(String(ruleVal).toLowerCase());
        break;
      case RuleOperator.IN:
        passed = Array.isArray(ruleVal) && ruleVal.map(String).includes(String(value));
        break;
      case RuleOperator.NOT_IN:
        passed = Array.isArray(ruleVal) && !ruleVal.map(String).includes(String(value));
        break;
      default:
        passed = true;
    }

    return {
      passed,
      reason: passed ? '' : `Rule constraint violated: ${rule.field} must satisfy ${rule.operator} ${JSON.stringify(ruleVal)}`,
      details: { field: rule.field, operator: rule.operator, actual: value, expected: ruleVal },
    };
  }

  private getNestedValue(obj: any, path: string): any {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }
}
