import { Injectable } from '@nestjs/common';
import { RawRequest, ParsedRequest, ToolDefinition, ActionDefinition } from '../../common/types';
import { RawRequestSchema } from '../../common/schemas';
import { ConfigurationService } from '../../config/configuration.service';

@Injectable()
export class ParserService {
  constructor(private configService: ConfigurationService) {}

  parse(raw: any): ParsedRequest {
    const parseErrors: string[] = [];
    let validatedRaw: RawRequest | null = null;

    // 1. Zod structural validation
    const result = RawRequestSchema.safeParse(raw);
    if (!result.success) {
      const errorDetails = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      parseErrors.push(...errorDetails);
      validatedRaw = raw as RawRequest;
    } else {
      validatedRaw = result.data as unknown as RawRequest;
    }

    // 2. Resolve ToolDefinition
    let toolDef: ToolDefinition | undefined;
    if (validatedRaw?.tool) {
      toolDef = this.configService.getTool(validatedRaw.tool);
      if (!toolDef) {
        parseErrors.push(`Tool '${validatedRaw.tool}' is not registered in the gateway.`);
      }
    } else {
      parseErrors.push("Field 'tool' is missing or invalid.");
    }

    // Default fallback tool definition if not resolved
    const resolvedTool: ToolDefinition = toolDef || {
      id: validatedRaw?.tool || 'unknown',
      name: validatedRaw?.tool || 'unknown',
      category: 'API',
      riskLevel: 'HIGH',
      requiresPiiRedaction: true,
      requiresComplianceCheck: true,
      maxExecutionTimeMs: 1000,
    };

    // 3. Resolve ActionDefinition
    const actionName = validatedRaw?.action || 'unknown';
    const resolvedAction: ActionDefinition = {
      name: actionName,
      description: `Action ${actionName} on tool ${resolvedTool.name}`,
      sideEffects: [],
      costEstimate: validatedRaw?.parameters?.amount || undefined,
    };

    // Construct the structured ParsedRequest
    return {
      id: validatedRaw?.id || `req_err_${Date.now()}`,
      agentId: validatedRaw?.agentId || 'unknown',
      sessionId: validatedRaw?.sessionId || 'unknown',
      timestamp: validatedRaw?.timestamp ? new Date(validatedRaw.timestamp) : new Date(),
      tool: resolvedTool,
      action: resolvedAction,
      parameters: validatedRaw?.parameters || {},
      metadata: validatedRaw?.metadata || {
        sourceIp: '127.0.0.1',
        userAgent: 'unknown',
        correlationId: `corr_err_${Date.now()}`,
        traceId: `trace_err_${Date.now()}`,
        environment: 'development',
        priority: 'NORMAL',
      },
      raw: validatedRaw || (raw as RawRequest),
      parseErrors,
    };
  }
}
