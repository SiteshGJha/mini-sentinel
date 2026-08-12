import { Injectable } from '@nestjs/common';
import { PIIMatch } from '../../common/types';

@Injectable()
export class PiiDetector {
  // Regex patterns
  private patterns = {
    SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
    CREDIT_CARD: /\b(?:3[47]\d{2}(?:[ -]?\d{6}){2}|(?:4\d{3}|5[1-5]\d{2}|6011)(?:[ -]?\d{4}){3})\b/g,
    BANK_ACCOUNT: /\b\d{8,17}\b/g, // Bank account numbers are 8 to 17 digits
    ADDRESS: /\b\d{1,5}\s+[a-zA-Z0-9\s.,#]{5,40}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|PO\s+Box)\b/gi,
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    PHONE: /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g,
  };

  detect(content: string): PIIMatch[] {
    const matches: PIIMatch[] = [];

    // 1. SSN
    let match;
    this.patterns.SSN.lastIndex = 0;
    while ((match = this.patterns.SSN.exec(content)) !== null) {
      matches.push({
        type: 'SSN',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.95,
      });
    }

    // 2. Credit Card (with Luhn check)
    this.patterns.CREDIT_CARD.lastIndex = 0;
    while ((match = this.patterns.CREDIT_CARD.exec(content)) !== null) {
      const cleanVal = match[0].replace(/[- ]/g, '');
      if (this.luhnCheck(cleanVal)) {
        matches.push({
          type: 'CREDIT_CARD',
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.99,
        });
      }
    }

    // 3. Email
    this.patterns.EMAIL.lastIndex = 0;
    while ((match = this.patterns.EMAIL.exec(content)) !== null) {
      matches.push({
        type: 'EMAIL',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.95,
      });
    }

    // 4. Phone
    this.patterns.PHONE.lastIndex = 0;
    while ((match = this.patterns.PHONE.exec(content)) !== null) {
      matches.push({
        type: 'PHONE',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
      });
    }

    // 5. Address
    this.patterns.ADDRESS.lastIndex = 0;
    while ((match = this.patterns.ADDRESS.exec(content)) !== null) {
      matches.push({
        type: 'ADDRESS',
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.80,
      });
    }

    // 6. Bank Account
    // Bank account numbers are just digits, so we should filter out values that were already matched by SSN or Credit Card
    this.patterns.BANK_ACCOUNT.lastIndex = 0;
    while ((match = this.patterns.BANK_ACCOUNT.exec(content)) !== null) {
      const val = match[0];
      const start = match.index;
      const end = start + val.length;

      // Check if this range overlaps with any already detected match
      const isOverlapping = matches.some(
        (m) => (start >= m.start && start < m.end) || (end > m.start && end <= m.end),
      );

      if (!isOverlapping) {
        // Simple heuristic: if surrounded by letters or characters indicating bank context, confidence is higher, otherwise 0.50
        const contextWindow = content.substring(Math.max(0, start - 20), Math.min(content.length, end + 20));
        const hasContext = /account|bank|checking|savings|routing|acc|dep/i.test(contextWindow);
        
        matches.push({
          type: 'BANK_ACCOUNT',
          value: val,
          start,
          end,
          confidence: hasContext ? 0.85 : 0.40,
        });
      }
    }

    // Sort matches by start index descending to make redaction replacement easier
    return matches.sort((a, b) => b.start - a.start);
  }

  private luhnCheck(numStr: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let i = numStr.length - 1; i >= 0; i--) {
      let digit = parseInt(numStr.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }
}
