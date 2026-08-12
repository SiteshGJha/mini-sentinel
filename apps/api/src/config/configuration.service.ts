import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { ComplianceRule, RuleType, RuleCategory, RuleOperator, RuleAction, ConfigValueType } from '@prisma/client';
import { ToolDefinition } from '../common/types';

@Injectable()
export class ConfigurationService implements OnModuleInit {
  private configCache = new Map<string, any>();
  private rulesCache: ComplianceRule[] = [];
  private toolsCache: ToolDefinition[] = [];

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.bootstrapDatabase();
    await this.loadAllToCache();
  }

  private async bootstrapDatabase() {
    // 1. Seed System Configuration (Re-seed on startup to guarantee new keys and tools are present)
    await this.prisma.systemConfiguration.deleteMany({});
    
    await this.prisma.systemConfiguration.createMany({
      data: [
        {
          key: 'risk_thresholds',
          value: { escalate: 0.7, block: 0.9 },
          valueType: ConfigValueType.OBJECT,
          description: 'Risk thresholds for verdicts',
          createdBy: 'SYSTEM',
          updatedBy: 'SYSTEM',
        },
        {
          key: 'execution_mode',
          value: 'ENFORCE',
          valueType: ConfigValueType.STRING,
          description: 'Global execution mode (ENFORCE or OBSERVE)',
          createdBy: 'SYSTEM',
          updatedBy: 'SYSTEM',
        },
        {
          key: 'security_settings',
          value: {
            enablePromptInjectionDetection: true,
            maxRequestSizeBytes: 1048576,
            requireRequestSignatures: false,
          },
          valueType: ConfigValueType.OBJECT,
          description: 'Global security validation settings',
          createdBy: 'SYSTEM',
          updatedBy: 'SYSTEM',
        },
        {
          key: 'tools',
          value: [
            {
              id: 'payment-processor',
              name: 'payment-processor',
              category: 'EXTERNAL_SERVICE',
              riskLevel: 'HIGH',
              requiresPiiRedaction: true,
              requiresComplianceCheck: true,
              maxExecutionTimeMs: 2000,
            },
            {
              id: 'customer-database',
              name: 'customer-database',
              category: 'DATABASE',
              riskLevel: 'MEDIUM',
              requiresPiiRedaction: true,
              requiresComplianceCheck: false,
              maxExecutionTimeMs: 1000,
            },
            {
              id: 'loan-underwriter',
              name: 'loan-underwriter',
              category: 'INTERNAL_SERVICE',
              riskLevel: 'HIGH',
              requiresPiiRedaction: false,
              requiresComplianceCheck: true,
              maxExecutionTimeMs: 1500,
            },
            {
              id: 'email-sender',
              name: 'email-sender',
              category: 'EXTERNAL_SERVICE',
              riskLevel: 'LOW',
              requiresPiiRedaction: true,
              requiresComplianceCheck: true,
              maxExecutionTimeMs: 3000,
            },
            {
              id: 'dialer',
              name: 'dialer',
              category: 'EXTERNAL_SERVICE',
              riskLevel: 'HIGH',
              requiresPiiRedaction: true,
              requiresComplianceCheck: true,
              maxExecutionTimeMs: 2000,
            },
          ],
          valueType: ConfigValueType.ARRAY,
          description: 'Registered tools and their security properties',
          createdBy: 'SYSTEM',
          updatedBy: 'SYSTEM',
        },
        {
          key: 'ofac_sanctions',
          value: [
            'VLADIMIR PUTIN',
            'SADDAM HUSSEIN',
            'OSAMA BIN LADEN',
            'AL-QAEDA',
            'KIM JONG UN',
          ],
          valueType: ConfigValueType.ARRAY,
          description: 'OFAC Sanctioned names list (Mock)',
          createdBy: 'SYSTEM',
          updatedBy: 'SYSTEM',
        },
      ],
    });


    // 2. Clear and Reseed sample compliance rules
    await this.prisma.complianceRule.deleteMany({});
    
    const sampleRules = [
      {
        id: "191943d5-666c-407a-9ed3-6205571cbfa0",
        name: "Valid Credit Score Range",
        description: "Credit score must be within valid FICO range",
        type: RuleType.CUSTOM,
        category: RuleCategory.RISK,
        enabled: true,
        priority: 5,
        field: "credit_score",
        operator: RuleOperator.EQUALS, // placeholder, conditions array will govern evaluation
        value: 0,
        conditions: [
          {
            field: "credit_score",
            operator: null,
            value: null,
            value_expression: null,
            type: "range",
            conditions: null,
            if: null,
            then: null,
            min: 300.0,
            max: 850.0,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Credit score outside valid range (300-850)"
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "09fd91c9-b1f1-412e-bde4-9a4645ce997a",
        name: "Minimum Credit Score",
        description: "Credit score must meet minimum threshold",
        type: RuleType.CUSTOM,
        category: RuleCategory.RISK,
        enabled: true,
        priority: 10,
        field: "credit_score",
        operator: RuleOperator.GREATER_THAN_OR_EQUAL,
        value: 620,
        conditions: [
          {
            field: "credit_score",
            operator: "gte",
            value: 620,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Credit score below minimum threshold of 620"
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "4c907171-8921-40ae-8a19-3c22c3bb6f80",
        name: "Maximum DTI Ratio (QM)",
        description: "Debt-to-income ratio cannot exceed 43%",
        type: RuleType.QM,
        category: RuleCategory.AMOUNT,
        enabled: true,
        priority: 20,
        field: "debt_to_income_ratio",
        operator: RuleOperator.LESS_THAN_OR_EQUAL,
        value: 0.43,
        conditions: [
          {
            field: "debt_to_income_ratio",
            operator: "lte",
            value: 0.43,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "DTI exceeds 43% QM limit"
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "e8613c55-866c-4dca-8184-95cb12672dc1",
        name: "Minimum Employment History",
        description: "Applicant should have at least 2 years employment history",
        type: RuleType.CUSTOM,
        category: RuleCategory.BEHAVIOR,
        enabled: true,
        priority: 30,
        field: "employment_years",
        operator: RuleOperator.GREATER_THAN_OR_EQUAL,
        value: 2,
        conditions: [
          {
            field: "employment_years",
            operator: "gte",
            value: 2,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.ESCALATE, // verdict FLAG maps to ESCALATE
        actionParams: {
          verdict: "FLAG",
          message: "Employment history less than 2 years"
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "9d26163d-0a45-4d86-bbed-402c83fb2503",
        name: "No More Than 7 Calls In 7 Days Per Account (Enforce)",
        description: "Reg F call frequency cap",
        type: RuleType.REG_F,
        category: RuleCategory.FREQUENCY,
        enabled: true,
        priority: 10,
        field: "calls_last_7_days",
        operator: RuleOperator.LESS_THAN_OR_EQUAL,
        value: 6,
        conditions: [
          {
            field: "calls_last_7_days",
            operator: "lte",
            value: 6,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Call frequency cap: Reg F 12 CFR 1006.14(b)(2)(i) presumes a violation above 7 calls about one debt within 7 consecutive days."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "5231528a-0f4f-4cb4-bc44-02ef1f688046",
        name: "7-Day Cooldown After A Telephone Conversation (Enforce)",
        description: "Reg F post-conversation cooldown",
        type: RuleType.REG_F,
        category: RuleCategory.FREQUENCY,
        enabled: true,
        priority: 10,
        field: "days_since_last_conversation",
        operator: RuleOperator.GREATER_THAN_OR_EQUAL,
        value: 7,
        conditions: [
          {
            field: "days_since_last_conversation",
            operator: "gte",
            value: 7,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Post-conversation cooldown: Reg F 12 CFR 1006.14(b)(2)(ii) presumes a violation where the consumer is called about a debt within 7 consecutive days of a telephone conversation."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "98d376da-61df-467b-9b40-4a0d19c97745",
        name: "Contact Only Between 8am And 9pm Consumer Local Time (Enforce)",
        description: "Contact only convenient times",
        type: RuleType.REG_F,
        category: RuleCategory.BEHAVIOR,
        enabled: true,
        priority: 10,
        field: "contact_hour_local",
        operator: RuleOperator.EQUALS,
        value: 0,
        conditions: [
          {
            field: "contact_hour_local",
            operator: null,
            value: null,
            value_expression: null,
            type: "range",
            conditions: null,
            if: null,
            then: null,
            min: 8.0,
            max: 20.0,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Inconvenient time: Reg F 12 CFR 1006.6(b)(1)(i) prohibits contact before 8:00 a.m. or after 9:00 p.m. local time."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "98ce76bc-6abc-48e5-8db4-beb58ff204d6",
        name: "Honour A Cease-Communication Request (Enforce)",
        description: "Stop direct contact",
        type: RuleType.REG_F,
        category: RuleCategory.BEHAVIOR,
        enabled: true,
        priority: 10,
        field: "cease_communication_requested",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not cease_communication_requested"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Cease-communication in force: FDCPA 15 U.S.C. 1692c(c) requires contact to stop."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "20149450-1f21-4bfb-8fd4-be1be7f2814d",
        name: "No Direct Contact Where Counsel Is Known (Enforce)",
        description: "No direct represented client contact",
        type: RuleType.REG_F,
        category: RuleCategory.IDENTITY,
        enabled: true,
        priority: 10,
        field: "consumer_represented_by_attorney",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not consumer_represented_by_attorney"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Consumer is represented: FDCPA 15 U.S.C. 1692c(a)(2) requires communicating through attorney."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "3e1a9c1a-698d-4cc2-85a9-c92d77063ee3",
        name: "No Debt Disclosure To Third Parties (Enforce)",
        description: "No third party disclosures",
        type: RuleType.REG_F,
        category: RuleCategory.IDENTITY,
        enabled: true,
        priority: 10,
        field: "third_party_recipient",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not third_party_recipient"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Third-party disclosure: FDCPA 15 U.S.C. 1692c(b) prohibits communicating about the debt."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      // Seed the remaining observer rule variants for completeness
      {
        id: "101964f7-f518-4842-b168-ff6c2ba70e1d",
        name: "No More Than 7 Calls In 7 Days Per Account (Observe)",
        description: "Observe Reg F call limits",
        type: RuleType.REG_F,
        category: RuleCategory.FREQUENCY,
        enabled: true,
        priority: 10,
        field: "calls_last_7_days",
        operator: RuleOperator.LESS_THAN_OR_EQUAL,
        value: 6,
        conditions: [
          {
            field: "calls_last_7_days",
            operator: "lte",
            value: 6,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Call frequency cap: Reg F 12 CFR 1006.14(b)(2)(i)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "07c63548-c249-4aed-970d-3e16390fc015",
        name: "7-Day Cooldown After A Telephone Conversation (Observe)",
        description: "Observe Reg F conversation cooldown",
        type: RuleType.REG_F,
        category: RuleCategory.FREQUENCY,
        enabled: true,
        priority: 10,
        field: "days_since_last_conversation",
        operator: RuleOperator.GREATER_THAN_OR_EQUAL,
        value: 7,
        conditions: [
          {
            field: "days_since_last_conversation",
            operator: "gte",
            value: 7,
            value_expression: null,
            type: "threshold",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Post-conversation cooldown: Reg F 12 CFR 1006.14(b)(2)(ii)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "61fc9542-3c93-422b-8eca-5283ff7ef444",
        name: "Contact Only Between 8am And 9pm Consumer Local Time (Observe)",
        description: "Observe Local Time rules",
        type: RuleType.REG_F,
        category: RuleCategory.BEHAVIOR,
        enabled: true,
        priority: 10,
        field: "contact_hour_local",
        operator: RuleOperator.EQUALS,
        value: 0,
        conditions: [
          {
            field: "contact_hour_local",
            operator: null,
            value: null,
            value_expression: null,
            type: "range",
            conditions: null,
            if: null,
            then: null,
            min: 8.0,
            max: 20.0,
            values: null,
            fields: null,
            expression: null
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Inconvenient time: Reg F 12 CFR 1006.6(b)(1)(i)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "efed49f0-30eb-44c1-9618-68c11473d64d",
        name: "Honour A Cease-Communication Request (Observe)",
        description: "Observe Cease Communication requests",
        type: RuleType.REG_F,
        category: RuleCategory.BEHAVIOR,
        enabled: true,
        priority: 10,
        field: "cease_communication_requested",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not cease_communication_requested"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Cease-communication in force: FDCPA 15 U.S.C. 1692c(c)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "a1a899e7-7255-448d-b881-309902354306",
        name: "No Direct Contact Where Counsel Is Known (Observe)",
        description: "Observe attorney direct contact rules",
        type: RuleType.REG_F,
        category: RuleCategory.IDENTITY,
        enabled: true,
        priority: 10,
        field: "consumer_represented_by_attorney",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not consumer_represented_by_attorney"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Consumer is represented: FDCPA 15 U.S.C. 1692c(a)(2)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "728284df-f8c3-44bb-b69b-9481ee60dd82",
        name: "No Debt Disclosure To Third Parties (Observe)",
        description: "Observe Third Party disclosures",
        type: RuleType.REG_F,
        category: RuleCategory.IDENTITY,
        enabled: true,
        priority: 10,
        field: "third_party_recipient",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not third_party_recipient"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Third-party disclosure: FDCPA 15 U.S.C. 1692c(b)."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "bd3e73bd-e67c-47ea-bd3b-fde358bf3688",
        name: "Bankruptcy Hold (Enforce)",
        description: "Must be false to communicate with customer",
        type: RuleType.REG_F,
        category: RuleCategory.RISK,
        enabled: true,
        priority: 10,
        field: "bankruptcy_hold",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not bankruptcy_hold"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Bankruptcy Hold is in place for this account."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      },
      {
        id: "a2b7c6d5-a3d8-4f76-bc8a-7890bfe1234a",
        name: "Bankruptcy Hold (Observe)",
        description: "Observe Bankruptcy Hold rules",
        type: RuleType.REG_F,
        category: RuleCategory.RISK,
        enabled: true,
        priority: 10,
        field: "bankruptcy_hold",
        operator: RuleOperator.EQUALS,
        value: false,
        conditions: [
          {
            field: null,
            operator: null,
            value: null,
            value_expression: null,
            type: "expression",
            conditions: null,
            if: null,
            then: null,
            min: null,
            max: null,
            values: null,
            fields: null,
            expression: "not bankruptcy_hold"
          }
        ] as any,
        action: RuleAction.BLOCK,
        actionParams: {
          verdict: "BLOCK",
          message: "Bankruptcy Hold is in place for this account."
        } as any,
        createdBy: "SYSTEM",
        updatedBy: "SYSTEM"
      }
    ];

    await this.prisma.complianceRule.createMany({
      data: sampleRules as any,
    });
  }

  async loadAllToCache() {
    // Load config parameters
    const dbConfigs = await this.prisma.systemConfiguration.findMany({
      where: { isActive: true },
    });
    for (const c of dbConfigs) {
      this.configCache.set(c.key, c.value);
      // Cache in Redis too
      await this.redis.set(`config:${c.key}`, JSON.stringify(c.value), 3600);
    }

    // Load compliance rules
    this.rulesCache = await this.prisma.complianceRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });
    await this.redis.set('config:compliance_rules', JSON.stringify(this.rulesCache), 3600);

    // Parse tools from config
    const toolsVal = this.configCache.get('tools');
    if (toolsVal && Array.isArray(toolsVal)) {
      this.toolsCache = toolsVal as ToolDefinition[];
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    const val = this.configCache.get(key);
    return val !== undefined ? (val as T) : (defaultValue as T);
  }

  getRules(): ComplianceRule[] {
    return this.rulesCache;
  }

  getTools(): ToolDefinition[] {
    return this.toolsCache;
  }

  getTool(toolName: string): ToolDefinition | undefined {
    return this.toolsCache.find((t) => t.name === toolName || t.id === toolName);
  }

  async updateConfig(key: string, value: any): Promise<void> {
    const existing = await this.prisma.systemConfiguration.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.systemConfiguration.update({
        where: { key },
        data: {
          value,
          version: { increment: 1 },
          updatedBy: 'API_UPDATE',
        },
      });
    } else {
      await this.prisma.systemConfiguration.create({
        data: {
          key,
          value,
          valueType: ConfigValueType.JSON,
          createdBy: 'API_UPDATE',
          updatedBy: 'API_UPDATE',
        },
      });
    }
    await this.loadAllToCache();
  }

  async updateRule(id: string, updateData: Partial<ComplianceRule>): Promise<void> {
    const rule = await this.prisma.complianceRule.findUnique({ where: { id } });
    if (!rule) throw new Error('Rule not found');

    const history = [...(rule.changeHistory as any[]), {
      updatedAt: rule.updatedAt,
      updatedBy: rule.updatedBy,
      version: rule.version,
      state: {
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        value: rule.value,
      },
    }];

    await this.prisma.complianceRule.update({
      where: { id },
      data: {
        ...(updateData as any),
        version: { increment: 1 },
        updatedBy: 'API_UPDATE',
        changeHistory: history,
      },
    });
    await this.loadAllToCache();
  }

  async createRule(ruleData: Omit<ComplianceRule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'changeHistory'>): Promise<ComplianceRule> {
    const newRule = await this.prisma.complianceRule.create({
      data: {
        ...(ruleData as any),
        version: 1,
        changeHistory: [],
      },
    });
    await this.loadAllToCache();
    return newRule;
  }

  async resetDatabase(): Promise<void> {
    await this.prisma.reviewTicket.deleteMany({});
    await this.prisma.auditRecord.deleteMany({});
    await this.prisma.systemMetric.deleteMany({});
    await this.onModuleInit();
  }
}
