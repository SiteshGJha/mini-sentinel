import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { RedisService } from '../src/common/redis.service';

describe('Gateway Interceptor (e2e)', () => {
  jest.setTimeout(30000);
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  }, 30000);

  beforeEach(async () => {
    if (prisma) await prisma.reviewTicket.deleteMany({});
    if (prisma) await prisma.auditRecord.deleteMany({});
    if (redis) await redis.flushall();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  async function pollStatus(requestId: string): Promise<any> {
    const maxAttempts = 50;
    for (let i = 0; i < maxAttempts; i++) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/status/${requestId}`,
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      if (body.status !== 'PENDING') {
        return body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Polling timeout for requestId: ${requestId}`);
  }

  it('should intercept a valid request, approve it, and execute it', async () => {
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018671',
      agentId: 'agent_abc',
      sessionId: 'session_xyz',
      timestamp: new Date().toISOString(),
      tool: 'customer-database',
      action: 'get-customer-details',
      parameters: {
        customerId: 'cust_999',
        fullName: 'Alice Miller',
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);
    const initialBody = JSON.parse(response.body);
    expect(initialBody.status).toBe('PENDING');

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('APPROVE');
    expect(body.executionResult.success).toBe(true);
    expect(body.executionResult.response.customerId).toBe('cust_999');

    // Verify audit log exists
    const auditRecord = await prisma.auditRecord.findUnique({
      where: { requestId: payload.id },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.chainIndex).toBe(0);
    expect(auditRecord?.previousHash).toBeNull();
  });

  it('should block requests that violate compliance rules (DTI > 43%)', async () => {
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018672',
      agentId: 'agent_abc',
      sessionId: 'session_xyz',
      timestamp: new Date().toISOString(),
      tool: 'loan-underwriter',
      action: 'evaluate-loan',
      parameters: {
        customerId: 'cust_111',
        monthlyIncome: 5000,
        monthlyDebt: 2500, // DTI = 50%
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('BLOCK');
    expect(body.reasoning).toContain('DTI exceeds 43% QM limit');
  });

  it('should escalate a high-risk request and verify human workflow approval heals the hash chain', async () => {
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018673',
      agentId: 'agent_abc',
      sessionId: 'session_xyz',
      timestamp: new Date().toISOString(),
      tool: 'payment-processor',
      action: 'process-payment',
      parameters: {
        customerId: 'cust_888',
        amount: 8500, // High cost estimate (>5000) trigger escalation
        currency: 'USD',
      },
    };

    // 1. Send request triggering escalation
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('ESCALATE');
    expect(body.escalationTicketId).toBeDefined();

    const ticketId = body.escalationTicketId;

    // Verify hash chain is initially valid
    let verifyResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/verify',
    });
    expect(JSON.parse(verifyResponse.body).verified).toBe(true);

    // 2. Reviewer approves the ticket
    const reviewResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/review/decide',
      payload: {
        ticketId,
        reviewerId: 'reviewer_bob',
        decision: 'APPROVE',
        notes: 'Verified transaction parameters are clean.',
      },
    });

    expect(reviewResponse.statusCode).toBe(200);
    const reviewResult = JSON.parse(reviewResponse.body);
    expect(reviewResult.ticket.status).toBe('APPROVED');
    expect(reviewResult.executionResult.success).toBe(true);

    // 3. Verify hash chain integrity after healing recalculation
    verifyResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/verify',
    });
    const verifyResult = JSON.parse(verifyResponse.body);
    expect(verifyResult.verified).toBe(true);

    // 4. Verify database shows human decision and execution response
    const auditRecord = await prisma.auditRecord.findUnique({
      where: { requestId: payload.id },
    });
    expect((auditRecord?.decisionRecord as any).verdict).toBe('APPROVE');
    expect((auditRecord?.executionResult as any).success).toBe(true);
  });

  it('should block a collections request if dialer attempts outside convenient hours (22:15)', async () => {
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018681',
      agentId: 'collections-bot',
      sessionId: 'session_123',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_col_1',
        phone: '+15551112222',
        localTime: '22:15',
        contactAttemptsLast7Days: 3,
        ceaseContact: false,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('BLOCK');
    expect(body.rulesTriggered).toContain('REG_F_TIME_WINDOW');
  });

  it('should block a collections request if customer has a bankruptcy hold', async () => {
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018682',
      agentId: 'collections-bot',
      sessionId: 'session_123',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_col_2',
        phone: '+15551112222',
        localTime: '10:00',
        contactAttemptsLast7Days: 1,
        bankruptcyHold: true,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('BLOCK');
    expect(body.rulesTriggered).toContain('BANKRUPTCY_HOLD');
    expect(body.redactedParameters.phone).toBe('+XXX-XXX-2222');
    expect(body.redactedParameters.customerId).toBe('cust_col_2');
  });

  it('should override verdict to APPROVE with warnings under OBSERVE mode', async () => {
    // 1. Change execution mode config to OBSERVE
    await app.inject({
      method: 'PUT',
      url: '/api/v1/config/execution_mode',
      payload: { value: 'OBSERVE' },
    });

    // 2. Submit same non-compliant request (time window violation)
    const payload = {
      id: 'd9b936a7-0e6d-4950-a92c-0e7855018683',
      agentId: 'collections-bot',
      sessionId: 'session_123',
      timestamp: new Date().toISOString(),
      tool: 'dialer',
      action: 'call-customer',
      parameters: {
        customerId: 'cust_col_3',
        phone: '+15551112222',
        localTime: '22:15',
        contactAttemptsLast7Days: 3,
        ceaseContact: false,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/intercept',
      payload,
    });

    expect(response.statusCode).toBe(202);

    const body = await pollStatus(payload.id);
    expect(body.verdict).toBe('APPROVE');
    expect(body.observeOverride).toBe(true);
    expect(body.rulesTriggered).toContain('REG_F_TIME_WINDOW');

    // 3. Restore execution mode to ENFORCE
    await app.inject({
      method: 'PUT',
      url: '/api/v1/config/execution_mode',
      payload: { value: 'ENFORCE' },
    });
  });
});
