import { z } from 'zod';

export const RequestMetadataSchema = z.object({
  sourceIp: z.string().default('127.0.0.1'),
  userAgent: z.string().default('unknown'),
  correlationId: z.string().default(() => `corr_${Math.random().toString(36).substr(2, 9)}`),
  traceId: z.string().default(() => `trace_${Math.random().toString(36).substr(2, 9)}`),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
});

export const RawRequestSchema = z.object({
  id: z.string().uuid().or(z.string()),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  timestamp: z.preprocess((arg) => {
    if (typeof arg === 'string' || arg instanceof Date) return new Date(arg);
    return arg;
  }, z.date()),
  tool: z.string().min(1),
  action: z.string().min(1),
  parameters: z.record(z.string(), z.any()),
  metadata: RequestMetadataSchema.optional(),
  signature: z.string().optional(),
});
