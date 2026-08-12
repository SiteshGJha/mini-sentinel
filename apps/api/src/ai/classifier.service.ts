import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiClassifierService {
  private readonly logger = new Logger(AiClassifierService.name);

  async classify(messageText: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        this.logger.log('Classifying outreach message using OpenAI API');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an AI assistant. Classify the following customer outreach message into exactly one of these categories: "Payment Issue", "Fraud Concern", "Hardship Request", "Dispute", or "Other". Reply with only the category name without punctuation.',
              },
              {
                role: 'user',
                content: messageText,
              },
            ],
            temperature: 0,
            max_tokens: 10,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const classification = data.choices?.[0]?.message?.content?.trim();
          if (classification) {
            this.logger.log(`OpenAI classification result: ${classification}`);
            return classification;
          }
        } else {
          this.logger.warn(`OpenAI API returned status ${response.status}: ${response.statusText}`);
        }
      } catch (err: any) {
        this.logger.error(`Error querying OpenAI: ${err.message}`);
      }
    }

    // Heuristic fallback if OpenAI API key is missing or failed
    this.logger.log('Classifying outreach message using local heuristics');
    return this.classifyHeuristically(messageText);
  }

  private classifyHeuristically(text: string): string {
    const t = text.toLowerCase();

    // 1. Fraud Concern
    if (/\b(fraud|scam|stolen|hacked|hack|unauthorized|stole|compromise|identity theft)\b/i.test(t)) {
      return 'Fraud Concern';
    }

    // 2. Hardship Request
    if (/\b(hardship|unemployed|unemployment|job loss|difficult|cannot pay|cant pay|struggling|bankrupt|bankruptcy|illness|medical|behind on bills)\b/i.test(t)) {
      return 'Hardship Request';
    }

    // 3. Dispute
    if (/\b(dispute|disputed|wrong amount|incorrect|not mine|not my account|error|mistake|chargeback|protest)\b/i.test(t)) {
      return 'Dispute';
    }

    // 4. Payment Issue
    if (/\b(payment|pay|charge|billed|billing|fee|invoice|wire|transfer|direct debit|declined)\b/i.test(t)) {
      return 'Payment Issue';
    }

    // 5. Other
    return 'Other';
  }
}
