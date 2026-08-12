import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function calculateSHA256(previousHash: string | null, contentStr: string, index: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(previousHash || 'GENESIS_BLOCK');
  hash.update(contentStr);
  hash.update(index.toString());
  return hash.digest('hex');
}

async function main() {
  const records = await prisma.auditRecord.findMany({
    orderBy: { chainIndex: 'asc' },
  });

  console.log(`Total records in audit log: ${records.length}`);

  for (let i = 0; i < records.length; i++) {
    const current = records[i];
    const expectedPrevHash = i === 0 ? null : records[i - 1].hash;
    
    if (current.previousHash !== expectedPrevHash) {
      console.log(`[BLOCK ${i}] Link mismatch! Link expected: ${expectedPrevHash}, found: ${current.previousHash}`);
    }

    const hashInput = {
      requestId: current.requestId,
      sessionId: current.sessionId,
      agentId: current.agentId,
      receivedAt: new Date(current.receivedAt).toISOString(),
      rawRequest: current.rawRequest,
      parsedRequest: {
        id: (current.parsedRequest as any).id,
        agentId: (current.parsedRequest as any).agentId,
        sessionId: (current.parsedRequest as any).sessionId,
        timestamp: new Date((current.parsedRequest as any).timestamp).toISOString(),
        tool: (current.parsedRequest as any).tool,
        action: (current.parsedRequest as any).action,
        parameters: (current.parsedRequest as any).parameters,
        metadata: (current.parsedRequest as any).metadata,
      },
      validationResult: current.validationResult,
      decisionRecord: current.decisionRecord,
      executionResult: current.executionResult || null,
    };

    const contentStr = JSON.stringify(hashInput);
    const computedHash = calculateSHA256(current.previousHash, contentStr, current.chainIndex);

    if (current.hash !== computedHash) {
      console.log(`\n--- BLOCK ${i} MISMATCH ---`);
      console.log(`Stored Hash:   ${current.hash}`);
      console.log(`Computed Hash: ${computedHash}`);
      console.log(`hashInput JSON structure (VerifyChain version):`);
      console.log(contentStr);
    } else {
      console.log(`[BLOCK ${i}] Hash matches!`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
