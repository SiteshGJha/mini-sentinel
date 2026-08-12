import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipeline } from '../src/validation/validation.pipeline';
import { PiiDetector } from '../src/validation/pii/pii.detector';
import { PiiRedactor } from '../src/validation/pii/pii.redactor';
import { RuleEngine } from '../src/validation/compliance/rule.engine';
import { SecurityValidator } from '../src/validation/security/security.validator';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/common/redis.service';
import { ConfigurationService } from '../src/config/configuration.service';
import { ParsedRequest } from '../src/common/types';

describe('Validation Latency Benchmark', () => {
  let pipeline: ValidationPipeline;

  beforeAll(async () => {
    const mockPrisma = {};
    const mockRedis = {};
    const mockConfigService = {
      get: jest.fn().mockImplementation((key, def) => {
        if (key === 'security_settings') {
          return {
            enablePromptInjectionDetection: true,
            maxRequestSizeBytes: 1048576,
            requireRequestSignatures: false,
          };
        }
        return def;
      }),
      getRules: jest.fn().mockReturnValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        PiiDetector,
        PiiRedactor,
        RuleEngine,
        SecurityValidator,
        ValidationPipeline,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigurationService, useValue: mockConfigService },
      ],
    }).compile();

    pipeline = moduleFixture.get(ValidationPipeline);
  });

  it('should complete all validation checks in under 1ms (99th percentile)', async () => {
    const request: ParsedRequest = {
      id: 'req_perf',
      agentId: 'agent_perf',
      sessionId: 'session_perf',
      timestamp: new Date(),
      tool: {
        id: 'customer-database',
        name: 'customer-database',
        riskLevel: 'MEDIUM',
        requiresComplianceCheck: false,
        requiresPiiRedaction: true,
        category: 'DATABASE',
        maxExecutionTimeMs: 1000,
      },
      action: {
        name: 'get-customer-details',
      },
      parameters: {
        customerId: 'cust_777',
        fullName: 'John Smith',
        email: 'john.smith@gmail.com', // triggers PII redaction
      },
      metadata: {
        sourceIp: '127.0.0.1',
        userAgent: 'benchmark',
        correlationId: 'benchmark_corr',
        traceId: 'benchmark_trace',
        environment: 'development',
        priority: 'NORMAL',
      },
      raw: {} as any,
      parseErrors: [],
    };

    // Warm-up run
    await pipeline.validate(request);

    const latencies: number[] = [];
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await pipeline.validate(request);
      const end = performance.now();
      latencies.push(end - start);
    }

    // Sort latencies to calculate percentiles
    latencies.sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);
    const avg = sum / runs;
    const p95 = latencies[Math.floor(runs * 0.95)];
    const p99 = latencies[Math.floor(runs * 0.99)];

    console.log(`=== Benchmark Latency Results ===`);
    console.log(`Average Latency: ${avg.toFixed(4)} ms`);
    console.log(`95th Percentile Latency: ${p95.toFixed(4)} ms`);
    console.log(`99th Percentile Latency: ${p99.toFixed(4)} ms`);
    console.log(`================================`);

    // Requirement: deterministic validation under 1ms
    expect(p99).toBeLessThan(1.0);
  });
});
