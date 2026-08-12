import { Injectable } from '@nestjs/common';
import { ParsedRequest, ExecutionResult } from '../common/types';

@Injectable()
export class RequestExecutor {
  async execute(request: ParsedRequest): Promise<ExecutionResult> {
    const startTime = performance.now();
    const toolName = request.tool.name;
    const actionName = request.action.name;
    const params = request.parameters;

    // Simulate different response bodies depending on the seeded tools
    let mockResponse: any = null;
    let success = true;
    let error: string | undefined;

    try {
      if (toolName === 'payment-processor') {
        if (actionName === 'process-payment') {
          const amount = params.amount || 0;
          const currency = params.currency || 'USD';
          mockResponse = {
            transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
            status: 'success',
            amount,
            currency,
            processedAt: new Date().toISOString(),
            message: `Successfully processed payment of ${amount} ${currency}.`,
          };
        } else {
          mockResponse = { message: `Action ${actionName} completed.` };
        }
      } else if (toolName === 'customer-database') {
        const customerId = params.customerId || 'unknown';
        mockResponse = {
          customerId,
          name: params.fullName || 'John Doe',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
          creditScore: 720,
          accounts: ['checking_123', 'savings_456'],
        };
      } else if (toolName === 'loan-underwriter') {
        const dti = params.dti || 35;
        const approved = dti <= 43;
        mockResponse = {
          approved,
          reason: approved ? 'DTI within qualified mortgage limits.' : 'DTI exceeds QM threshold of 43%.',
          underwriterId: 'underwriter_sys_1',
          riskClass: dti < 30 ? 'LOW' : 'MEDIUM',
        };
      } else if (toolName === 'email-sender') {
        mockResponse = {
          messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
          recipient: params.email || 'customer@example.com',
          delivered: true,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Fallback for custom tools
        mockResponse = {
          message: `Dynamic execution mock for ${toolName}:${actionName}`,
          params,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      success = false;
      error = err.message || 'Execution error';
    }

    const duration = performance.now() - startTime;

    return {
      requestId: request.id,
      success,
      response: mockResponse,
      executionTimeMs: duration,
      error,
      metadata: {
        node: `worker_${process.pid}`,
        thread: 'main',
      },
    };
  }
}
