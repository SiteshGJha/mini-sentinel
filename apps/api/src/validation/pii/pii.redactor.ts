import { Injectable, Logger } from "@nestjs/common";
import { PiiDetector } from "./pii.detector";
import { PIIMatch } from "../../common/types";
import { TcpClientService } from "../../common/queue/tcp-client.service";

@Injectable()
export class PiiRedactor {
  private readonly logger = new Logger(PiiRedactor.name);

  constructor(
    private detector: PiiDetector,
    private tcpClient: TcpClientService,
  ) {}

  redactString(content: string): { redactedText: string; matches: PIIMatch[] } {
    const matches = this.detector.detect(content);
    let redactedText = content;

    for (const match of matches) {
      const mask = this.getMask(match.type, match.value);
      redactedText =
        redactedText.substring(0, match.start) +
        mask +
        redactedText.substring(match.end);
    }

    return {
      redactedText,
      matches,
    };
  }

  async redactParametersAsync(params: Record<string, any>): Promise<{
    redactedParams: Record<string, any>;
    redactedCount: number;
    matches: { path: string; type: string }[];
  }> {
    try {
      // Query the Python PII microservice over TCP
      const response = await this.tcpClient.send({ parameters: params });
      if (response && response.redactedParams) {
        return {
          redactedParams: response.redactedParams,
          redactedCount: response.redactedCount || 0,
          matches: response.matches || [],
        };
      }
    } catch (err: any) {
      this.logger.warn(
        `PII microservice TCP query failed: ${err.message}. Falling back to local heuristics.`,
      );
    }

    // Fallback: use local regex heuristics
    return this.redactParametersLocal(params);
  }

  redactParameters(params: Record<string, any>): {
    redactedParams: Record<string, any>;
    redactedCount: number;
    matches: { path: string; type: string }[];
  } {
    return this.redactParametersLocal(params);
  }

  private redactParametersLocal(params: Record<string, any>): {
    redactedParams: Record<string, any>;
    redactedCount: number;
    matches: { path: string; type: string }[];
  } {
    let redactedCount = 0;
    const matches: { path: string; type: string }[] = [];

    const recurse = (obj: any, path: string): any => {
      if (obj === null || obj === undefined) return obj;

      if (typeof obj === "string") {
        const { redactedText, matches: stringMatches } = this.redactString(obj);
        if (stringMatches.length > 0) {
          redactedCount += stringMatches.length;
          stringMatches.forEach((m) => matches.push({ path, type: m.type }));
          return redactedText;
        }

        // Direct key name check as a secondary safeguard
        const keyName = path.split(".").pop() || "";
        if (this.isSensitiveKey(keyName)) {
          redactedCount++;
          matches.push({ path, type: this.inferPiiTypeFromKey(keyName) });
          return this.getMask(this.inferPiiTypeFromKey(keyName), obj);
        }

        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map((item, idx) => recurse(item, `${path}[${idx}]`));
      }

      if (typeof obj === "object") {
        const result: Record<string, any> = {};
        for (const [key, val] of Object.entries(obj)) {
          result[key] = recurse(val, path ? `${path}.${key}` : key);
        }
        return result;
      }

      return obj;
    };

    const redactedParams = recurse(params, "");
    return { redactedParams, redactedCount, matches };
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      "ssn",
      "socialsecurity",
      "creditcard",
      "ccnumber",
      "pan",
      "bankaccount",
      "accountnumber",
      "routingnumber",
      "address",
      "street",
      "email",
      "phone",
      "phonenumber",
      "dateofbirth",
      "dob",
    ];
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    return sensitiveKeys.some((k) => normalizedKey.includes(k));
  }

  private inferPiiTypeFromKey(key: string): PIIMatch["type"] {
    const k = key.toLowerCase();
    if (k.includes("ssn") || k.includes("social")) return "SSN";
    if (k.includes("card") || k.includes("cc") || k.includes("pan"))
      return "CREDIT_CARD";
    if (k.includes("bank") || k.includes("account")) return "BANK_ACCOUNT";
    if (k.includes("address") || k.includes("street")) return "ADDRESS";
    if (k.includes("email")) return "EMAIL";
    return "PHONE";
  }

  private getMask(type: PIIMatch["type"], value: string): string {
    switch (type) {
      case "SSN":
        return `XXX-XX-${value.slice(-4)}`;
      case "CREDIT_CARD":
        const clean = value.replace(/[- ]/g, "");
        return `XXXX-XXXX-XXXX-${clean.slice(-4)}`;
      case "BANK_ACCOUNT":
        return `XXXXXX${value.slice(-4)}`;
      case "ADDRESS":
        return "[REDACTED ADDRESS]";
      case "EMAIL":
        const [local, domain] = value.split("@");
        if (!local || !domain) return "[REDACTED EMAIL]";
        return `${local[0]}***@${domain}`;
      case "PHONE":
        return `XXX-XXX-${value.slice(-4)}`;
      default:
        return "[REDACTED]";
    }
  }
}
