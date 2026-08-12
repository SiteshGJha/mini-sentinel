import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RawRequest, ParsedRequest, ValidationResult, Decision, ExecutionResult, AuditRecord } from '../common/types';
import * as crypto from 'crypto';
import * as os from 'os';

class Mutex {
  private promise: Promise<any> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const nextPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentPromise = this.promise;
    this.promise = nextPromise;
    await currentPromise;
    return release!;
  }
}

@Injectable()
export class AuditService {
  private mutex = new Mutex();

  constructor(private prisma: PrismaService) {}

  async record(
    rawRequest: RawRequest,
    parsedRequest: ParsedRequest,
    validationResult: ValidationResult,
    decisionRecord: Decision,
    executionResult?: ExecutionResult,
  ): Promise<AuditRecord> {
    const release = await this.mutex.acquire();
    try {
      const receivedAt = new Date(rawRequest.timestamp);
      const processedAt = new Date();
      const completedAt = new Date();

      // Find the latest chain record to link the hashes
      const latest = await this.prisma.auditRecord.findFirst({
        orderBy: { chainIndex: 'desc' },
      });

      const chainIndex = latest ? latest.chainIndex + 1 : 0;
      const previousHash = latest ? latest.hash : null;

      // 1. Create record with a temporary hash first
      const tempHash = `TEMP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const dbRecord = await this.prisma.auditRecord.create({
        data: {
          requestId: parsedRequest.id,
          sessionId: parsedRequest.sessionId,
          agentId: parsedRequest.agentId,
          receivedAt,
          processedAt,
          completedAt,
          rawRequest: rawRequest as any,
          parsedRequest: parsedRequest as any,
          validationResult: validationResult as any,
          decisionRecord: decisionRecord as any,
          executionResult: (executionResult as any) || null,
          hash: tempHash,
          previousHash,
          chainIndex,
          gatewayVersion: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          hostname: os.hostname(),
          processingNode: `node_${process.pid}`,
        },
      });

      // 2. Reload the record from database to get exact DB-serialized representation
      const current = await this.prisma.auditRecord.findUnique({
        where: { id: dbRecord.id },
      });
      if (!current) throw new Error('Database record write verification failed');

      // 3. Construct hash input from DB-loaded values
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
      const hash = this.calculateSHA256(previousHash, contentStr, chainIndex);

      // 4. Update with final calculated hash
      const updatedRecord = await this.prisma.auditRecord.update({
        where: { id: dbRecord.id },
        data: { hash },
      });

      // Update previous block's nextHash if N-1 exists
      if (latest) {
        await this.prisma.auditRecord.update({
          where: { id: latest.id },
          data: { nextHash: hash },
        });
      }

      return this.mapToAuditRecord(updatedRecord);
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to append to audit trail: ${error.message}`);
    } finally {
      release();
    }
  }

  async updateRecordAndRecalculate(
    requestId: string,
    updateData: { decisionRecord: Decision; validationResult?: ValidationResult; executionResult?: ExecutionResult },
  ): Promise<AuditRecord> {
    const release = await this.mutex.acquire();
    try {
      const recordToUpdate = await this.prisma.auditRecord.findUnique({
        where: { requestId },
      });
      if (!recordToUpdate) {
        throw new NotFoundException(`Audit record with requestId ${requestId} not found`);
      }

      // Update in DB first
      const dataToUpdate: any = {
        decisionRecord: updateData.decisionRecord as any,
        executionResult: (updateData.executionResult as any) || null,
        completedAt: new Date(),
      };
      if (updateData.validationResult) {
        dataToUpdate.validationResult = updateData.validationResult as any;
      }

      await this.prisma.auditRecord.update({
        where: { id: recordToUpdate.id },
        data: dataToUpdate,
      });

      // Load all records from the updated one onwards
      const recordsToRecalculate = await this.prisma.auditRecord.findMany({
        where: { chainIndex: { gte: recordToUpdate.chainIndex } },
        orderBy: { chainIndex: 'asc' },
      });

      let lastHash = recordToUpdate.chainIndex === 0
        ? null
        : (await this.prisma.auditRecord.findFirst({
            where: { chainIndex: recordToUpdate.chainIndex - 1 },
          }))?.hash || null;

      for (const rec of recordsToRecalculate) {
        const hashInput = {
          requestId: rec.requestId,
          sessionId: rec.sessionId,
          agentId: rec.agentId,
          receivedAt: new Date(rec.receivedAt).toISOString(),
          rawRequest: rec.rawRequest,
          parsedRequest: {
            id: (rec.parsedRequest as any).id,
            agentId: (rec.parsedRequest as any).agentId,
            sessionId: (rec.parsedRequest as any).sessionId,
            timestamp: new Date((rec.parsedRequest as any).timestamp).toISOString(),
            tool: (rec.parsedRequest as any).tool,
            action: (rec.parsedRequest as any).action,
            parameters: (rec.parsedRequest as any).parameters,
            metadata: (rec.parsedRequest as any).metadata,
          },
          validationResult: rec.validationResult,
          decisionRecord: rec.decisionRecord,
          executionResult: rec.executionResult || null,
        };

        const contentStr = JSON.stringify(hashInput);
        const newHash = this.calculateSHA256(lastHash, contentStr, rec.chainIndex);

        await this.prisma.auditRecord.update({
          where: { id: rec.id },
          data: {
            previousHash: lastHash,
            hash: newHash,
          },
        });

        // Update the previous block's nextHash if N-1 exists
        if (lastHash) {
          const prevRecord = await this.prisma.auditRecord.findFirst({
            where: { hash: lastHash },
          });
          if (prevRecord) {
            await this.prisma.auditRecord.update({
              where: { id: prevRecord.id },
              data: { nextHash: newHash },
            });
          }
        }

        lastHash = newHash;
      }

      const finalRecord = await this.prisma.auditRecord.findUnique({
        where: { id: recordToUpdate.id },
      });
      return this.mapToAuditRecord(finalRecord);
    } finally {
      release();
    }
  }

  calculateSHA256(previousHash: string | null, contentStr: string, index: number): string {
    const hash = crypto.createHash('sha256');
    hash.update(previousHash || 'GENESIS_BLOCK');
    hash.update(contentStr);
    hash.update(index.toString());
    return hash.digest('hex');
  }

  async verifyChain(): Promise<{ verified: boolean; tamperedIndex?: number; reason?: string }> {
    const release = await this.mutex.acquire();
    try {
      const records = await this.prisma.auditRecord.findMany({
        orderBy: { chainIndex: 'asc' },
      });

      for (let i = 0; i < records.length; i++) {
        const current = records[i];

        if (current.chainIndex !== i) {
          return {
            verified: false,
            tamperedIndex: i,
            reason: `Index mismatch: Expected index ${i}, found ${current.chainIndex}`,
          };
        }

        const expectedPrevHash = i === 0 ? null : records[i - 1].hash;
        if (current.previousHash !== expectedPrevHash) {
          return {
            verified: false,
            tamperedIndex: i,
            reason: `Link mismatch: Expected previousHash to be '${expectedPrevHash}', found '${current.previousHash}'`,
          };
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
        const computedHash = this.calculateSHA256(current.previousHash, contentStr, current.chainIndex);

        if (current.hash !== computedHash) {
          return {
            verified: false,
            tamperedIndex: i,
            reason: `Integrity failure: Computed hash is '${computedHash}', but record contains '${current.hash}'`,
          };
        }
      }

      return { verified: true };
    } finally {
      release();
    }
  }

  async getChainRecords(): Promise<AuditRecord[]> {
    const dbRecords = await this.prisma.auditRecord.findMany({
      orderBy: { chainIndex: 'asc' },
    });
    return dbRecords.map((r) => this.mapToAuditRecord(r));
  }

  private mapToAuditRecord(db: any): AuditRecord {
    return {
      id: db.id,
      requestId: db.requestId,
      sessionId: db.sessionId,
      agentId: db.agentId,
      receivedAt: db.receivedAt,
      processedAt: db.processedAt,
      completedAt: db.completedAt,
      rawRequest: db.rawRequest as any,
      parsedRequest: db.parsedRequest as any,
      validationResult: db.validationResult as any,
      decisionRecord: db.decisionRecord as any,
      executionResult: db.executionResult as any || undefined,
      hash: db.hash,
      previousHash: db.previousHash,
      nextHash: db.nextHash,
      chainIndex: db.chainIndex,
      gatewayVersion: db.gatewayVersion,
      environment: db.environment,
      hostname: db.hostname,
      processingNode: db.processingNode,
    };
  }
}
