import { ZodSchema } from 'zod';

export type Verdict = 'APPROVE' | 'BLOCK' | 'ESCALATE';

export interface RequestMetadata {
  sourceIp: string;
  userAgent: string;
  correlationId: string;
  traceId: string;
  environment: 'development' | 'staging' | 'production';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

export interface RawRequest {
  id: string;
  agentId: string;
  sessionId: string;
  timestamp: string | Date;
  tool: string;
  action: string;
  parameters: Record<string, any>;
  metadata?: RequestMetadata;
  signature?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: 'API' | 'DATABASE' | 'EXTERNAL_SERVICE' | 'INTERNAL_SERVICE';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresPiiRedaction: boolean;
  requiresComplianceCheck: boolean;
  maxExecutionTimeMs: number;
}

export interface ActionDefinition {
  name: string;
  description?: string;
  inputSchema?: any; // Zod or other validation schema
  outputSchema?: any;
  sideEffects?: string[];
  costEstimate?: number;
}

export interface ParsedRequest {
  id: string;
  agentId: string;
  sessionId: string;
  timestamp: Date;
  tool: ToolDefinition;
  action: ActionDefinition;
  parameters: Record<string, any>;
  metadata: RequestMetadata;
  raw: RawRequest;
  parseErrors: string[];
}

export type ValidationType =
  | 'PII_DETECTION'
  | 'PII_REDACTION'
  | 'REG_F_COMPLIANCE'
  | 'QM_COMPLIANCE'
  | 'OFAC_COMPLIANCE'
  | 'SECURITY_VALIDATION'
  | 'SCHEMA_VALIDATION'
  | 'BUSINESS_LOGIC';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED' | 'ERROR';

export interface ValidationFailure {
  rule: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ValidationCheck {
  id: string;
  type: ValidationType;
  name: string;
  description: string;
  status: CheckStatus;
  result: any;
  error?: string;
  durationMs: number;
  ruleId?: string;
}

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
  riskScore: number;
  validationTime: number; // in ms
  checks: ValidationCheck[];
}

export interface PIIMatch {
  type: 'SSN' | 'CREDIT_CARD' | 'BANK_ACCOUNT' | 'ADDRESS' | 'EMAIL' | 'PHONE';
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface RedactedContent {
  content: string;
  redactions: {
    match: PIIMatch;
    redactedValue: string;
  }[];
  auditHash: string;
}

export interface DecisionReasoning {
  summary: string;
  factors: {
    type: string;
    description: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    weight: number;
    value: any;
  }[];
  recommendations?: string[];
  warnings?: string[];
}

export interface Decision {
  verdict: Verdict;
  requestId: string;
  timestamp: Date;
  riskScore: number;
  reasoning: string;
  reasoningDetails?: DecisionReasoning;
  validationSummary?: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    failures: ValidationFailure[];
  };
}

export interface ExecutionResult {
  requestId: string;
  success: boolean;
  response: any;
  executionTimeMs: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AuditRecord {
  id: string;
  requestId: string;
  sessionId: string;
  agentId: string;
  receivedAt: Date;
  processedAt: Date;
  completedAt: Date;
  rawRequest: RawRequest;
  parsedRequest: ParsedRequest;
  validationResult: ValidationResult;
  decisionRecord: Decision;
  executionResult?: ExecutionResult;
  hash: string;
  previousHash: string | null;
  nextHash: string | null;
  chainIndex: number;
  gatewayVersion: string;
  environment: string;
  hostname: string;
  processingNode: string;
}

export interface SystemMetrics {
  requestCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  verdictDistribution: Record<Verdict, number>;
  validationFailureRate: number;
  escalationRate: number;
}
