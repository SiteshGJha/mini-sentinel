import { RuleEngine } from './rule.engine';
import { PrismaService } from '../../common/prisma.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ParsedRequest } from '../../common/types';
import { RuleType, RuleOperator, RuleAction, RuleCategory } from '@prisma/client';

describe('Compliance Rule Engine', () => {
  let ruleEngine: RuleEngine;
  let mockPrisma: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockPrisma = {
      auditRecord: {
        count: jest.fn(),
      },
    };
    mockConfigService = {
      getRules: jest.fn(),
      get: jest.fn(),
    };

    ruleEngine = new RuleEngine(mockPrisma as any, mockConfigService as any);
  });

  describe('QM DTI Thresholds', () => {
    it('should PASS QM check when DTI <= 43%', async () => {
      const rules = [
        {
          id: 'rule_qm',
          name: 'QM Rule',
          type: RuleType.QM,
          category: RuleCategory.AMOUNT,
          enabled: true,
          field: 'parameters.dti',
          operator: RuleOperator.LESS_THAN_OR_EQUAL,
          value: 43.0,
          action: RuleAction.BLOCK,
        },
      ];
      mockConfigService.getRules.mockReturnValue(rules);

      const request: ParsedRequest = {
        id: 'req_1',
        agentId: 'agent_1',
        sessionId: 'session_1',
        timestamp: new Date(),
        tool: { id: 'loan-underwriter', name: 'loan-underwriter', riskLevel: 'HIGH', requiresComplianceCheck: true, requiresPiiRedaction: false, category: 'API', maxExecutionTimeMs: 1000 },
        action: { name: 'underwrite' },
        parameters: { dti: 38.5 },
        metadata: {} as any,
        raw: {} as any,
        parseErrors: [],
      };

      const result = await ruleEngine.evaluate(request);
      expect(result.passed).toBe(true);
      expect(result.checks[0].status).toBe('PASS');
    });

    it('should BLOCK QM check when DTI > 43%', async () => {
      const rules = [
        {
          id: 'rule_qm',
          name: 'QM Rule',
          type: RuleType.QM,
          category: RuleCategory.AMOUNT,
          enabled: true,
          field: 'parameters.dti',
          operator: RuleOperator.LESS_THAN_OR_EQUAL,
          value: 43.0,
          action: RuleAction.BLOCK,
        },
      ];
      mockConfigService.getRules.mockReturnValue(rules);

      const request: ParsedRequest = {
        id: 'req_1',
        agentId: 'agent_1',
        sessionId: 'session_1',
        timestamp: new Date(),
        tool: { id: 'loan-underwriter', name: 'loan-underwriter', riskLevel: 'HIGH', requiresComplianceCheck: true, requiresPiiRedaction: false, category: 'API', maxExecutionTimeMs: 1000 },
        action: { name: 'underwrite' },
        parameters: { dti: 45.2 },
        metadata: {} as any,
        raw: {} as any,
        parseErrors: [],
      };

      const result = await ruleEngine.evaluate(request);
      expect(result.passed).toBe(false);
      expect(result.checks[0].status).toBe('FAIL');
      expect(result.failures[0].reason).toContain('Qualified Mortgage DTI threshold of 43% exceeded');
    });
  });

  describe('OFAC Sanctions Checks', () => {
    it('should BLOCK when name matches sanctioned entity', async () => {
      const rules = [
        {
          id: 'rule_ofac',
          name: 'OFAC Rule',
          type: RuleType.OFAC,
          category: RuleCategory.IDENTITY,
          enabled: true,
          field: 'parameters.fullName',
          operator: RuleOperator.NOT_IN,
          value: [],
          action: RuleAction.BLOCK,
        },
      ];
      mockConfigService.getRules.mockReturnValue(rules);
      mockConfigService.get.mockReturnValue(['OSAMA BIN LADEN', 'KIM JONG UN']);

      const request: ParsedRequest = {
        id: 'req_2',
        agentId: 'agent_1',
        sessionId: 'session_1',
        timestamp: new Date(),
        tool: { id: 'payment', name: 'payment', riskLevel: 'HIGH', requiresComplianceCheck: true, requiresPiiRedaction: false, category: 'API', maxExecutionTimeMs: 1000 },
        action: { name: 'send' },
        parameters: { fullName: 'Osama Bin Laden' },
        metadata: {} as any,
        raw: {} as any,
        parseErrors: [],
      };

      const result = await ruleEngine.evaluate(request);
      expect(result.passed).toBe(false);
      expect(result.failures[0].reason).toContain('OFAC Sanction Match detected');
    });

    it('should PASS when name does not match any sanctioned entity', async () => {
      const rules = [
        {
          id: 'rule_ofac',
          name: 'OFAC Rule',
          type: RuleType.OFAC,
          category: RuleCategory.IDENTITY,
          enabled: true,
          field: 'parameters.fullName',
          operator: RuleOperator.NOT_IN,
          value: [],
          action: RuleAction.BLOCK,
        },
      ];
      mockConfigService.getRules.mockReturnValue(rules);
      mockConfigService.get.mockReturnValue(['OSAMA BIN LADEN', 'KIM JONG UN']);

      const request: ParsedRequest = {
        id: 'req_2',
        agentId: 'agent_1',
        sessionId: 'session_1',
        timestamp: new Date(),
        tool: { id: 'payment', name: 'payment', riskLevel: 'HIGH', requiresComplianceCheck: true, requiresPiiRedaction: false, category: 'API', maxExecutionTimeMs: 1000 },
        action: { name: 'send' },
        parameters: { fullName: 'Alice Johnson' },
        metadata: {} as any,
        raw: {} as any,
        parseErrors: [],
      };

      const result = await ruleEngine.evaluate(request);
      expect(result.passed).toBe(true);
    });
  });
});
