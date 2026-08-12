import { PiiDetector } from './pii.detector';
import { PiiRedactor } from './pii.redactor';
import * as fc from 'fast-check';

describe('PII Detection & Redaction', () => {
  let detector: PiiDetector;
  let redactor: PiiRedactor;

  beforeEach(() => {
    detector = new PiiDetector();
    const tcpClient = {
      send: jest.fn().mockRejectedValue(new Error('No TCP server in unit tests')),
    } as any;
    redactor = new PiiRedactor(detector, tcpClient);
  });

  describe('Unit Tests', () => {
    it('should detect and redact a standard SSN', () => {
      const text = 'Customer SSN is 123-45-6789.';
      const result = redactor.redactString(text);
      expect(result.redactedText).toBe('Customer SSN is XXX-XX-6789.');
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].type).toBe('SSN');
    });

    it('should detect and redact valid credit card numbers', () => {
      // Visa starting digit 4, 16 digits, passes Luhn
      const card = '4111-1111-1111-1111';
      const text = `Card number: ${card}`;
      const result = redactor.redactString(text);
      expect(result.redactedText).toBe('Card number: XXXX-XXXX-XXXX-1111');
      expect(result.matches.length).toBe(1);
    });

    it('should NOT redact invalid credit card numbers failing Luhn check', () => {
      const invalidCard = '4111-1111-1111-1112'; // fails Luhn
      const text = `Card number: ${invalidCard}`;
      const result = redactor.redactString(text);
      expect(result.redactedText).toBe(text);
      expect(result.matches.length).toBe(0);
    });

    it('should redact emails and phone numbers', () => {
      const text = 'Contact john.doe@example.com at 1-800-555-0199';
      const result = redactor.redactString(text);
      expect(result.redactedText).toContain('j***@example.com');
      expect(result.redactedText).toContain('XXX-XXX-0199');
    });

    it('should recursively redact structured parameters object', () => {
      const params = {
        user: {
          fullName: 'John Smith',
          ssn: '987-65-4321',
        },
        payment: {
          account: '123456789012',
          billingAddress: '123 Main St, Springfield, OR',
        },
      };

      const { redactedParams, redactedCount } = redactor.redactParameters(params);
      expect(redactedCount).toBe(3); // ssn, account (bank account), billingAddress
      expect(redactedParams.user.ssn).toBe('XXX-XX-4321');
      expect(redactedParams.payment.account).toBe('XXXXXX9012');
      expect(redactedParams.payment.billingAddress).toBe('[REDACTED ADDRESS]');
    });

    it('should query TCP microservice and fall back to local heuristics on failure', async () => {
      const params = { ssn: '123-45-6789' };

      // Case 1: TCP succeeds
      const tcpClientMock = {
        send: jest.fn().mockResolvedValue({
          redactedParams: { ssn: 'TCP-REDACTED-SSN' },
          redactedCount: 1,
          matches: [{ path: 'ssn', type: 'SSN' }]
        })
      } as any;
      const customRedactor = new PiiRedactor(detector, tcpClientMock);
      const res = await customRedactor.redactParametersAsync(params);
      expect(res.redactedParams.ssn).toBe('TCP-REDACTED-SSN');
      expect(res.redactedCount).toBe(1);
      expect(tcpClientMock.send).toHaveBeenCalledWith({ parameters: params });

      // Case 2: TCP fails (fallback to local)
      const tcpClientFail = {
        send: jest.fn().mockRejectedValue(new Error('Connection failure'))
      } as any;
      const fallbackRedactor = new PiiRedactor(detector, tcpClientFail);
      const resFallback = await fallbackRedactor.redactParametersAsync(params);
      expect(resFallback.redactedParams.ssn).toBe('XXX-XX-6789');
      expect(resFallback.redactedCount).toBe(1);
    });
  });

  describe('Property-Based Tests', () => {
    it('should verify that for any arbitrary text with an SSN, the redacted text never leaks the original SSN', () => {
      fc.assert(
        fc.property(
          fc.string(), // Arbitrary prefix
          fc.string(), // Arbitrary suffix
          fc.integer({ min: 100, max: 999 }), // SSN part 1
          fc.integer({ min: 10, max: 99 }),   // SSN part 2
          fc.integer({ min: 1000, max: 9999 }), // SSN part 3
          (prefix, suffix, p1, p2, p3) => {
            const rawSsn = `${p1}-${p2}-${p3}`;
            const text = `${prefix} ${rawSsn} ${suffix}`;

            const result = redactor.redactString(text);

            // Property 1: The original SSN should not exist in the redacted text
            expect(result.redactedText).not.toContain(rawSsn);

            // Property 2: A redacted mask should be present in the output
            const expectedMask = `XXX-XX-${p3}`;
            expect(result.redactedText).toContain(expectedMask);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
