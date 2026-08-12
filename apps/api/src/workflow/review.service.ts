import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Decision, ParsedRequest, ExecutionResult } from '../common/types';
import { RequestExecutor } from '../integration/executor.service';
import { AuditService } from '../audit/audit.service';
import { ReviewStatus, ReviewPriority, ReviewDecision } from '@prisma/client';

@Injectable()
export class ReviewService {
  constructor(
    private prisma: PrismaService,
    private executor: RequestExecutor,
    private auditService: AuditService,
  ) {}

  async escalate(decision: Decision, request: ParsedRequest): Promise<any> {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 24); // 24 hours deadline

    // Generate numeric ticket number
    const ticketCount = await this.prisma.reviewTicket.count();
    const ticketNumber = `TKT-${1000 + ticketCount + 1}`;

    // Map priority based on riskScore
    let priority: ReviewPriority = ReviewPriority.NORMAL;
    if (decision.riskScore >= 0.9) priority = ReviewPriority.CRITICAL;
    else if (decision.riskScore >= 0.8) priority = ReviewPriority.HIGH;
    else if (decision.riskScore < 0.4) priority = ReviewPriority.LOW;

    // Fetch the audit record ID for this request
    const auditRecord = await this.prisma.auditRecord.findUnique({
      where: { requestId: request.id },
    });

    if (!auditRecord) {
      throw new NotFoundException(`Audit record not found for request ID ${request.id}`);
    }

    const ticket = await this.prisma.reviewTicket.create({
      data: {
        requestId: request.id,
        auditRecordId: auditRecord.id,
        ticketNumber,
        status: ReviewStatus.PENDING,
        priority,
        agentId: request.agentId,
        toolName: request.tool.name,
        actionName: request.action.name,
        riskScore: decision.riskScore,
        reviewDeadline: deadline,
      },
    });

    return ticket;
  }

  async getPending(): Promise<any[]> {
    return this.prisma.reviewTicket.findMany({
      where: { status: ReviewStatus.PENDING },
      orderBy: { escalatedAt: 'desc' },
    });
  }

  async getHistory(): Promise<any[]> {
    return this.prisma.reviewTicket.findMany({
      where: {
        status: { in: [ReviewStatus.APPROVED, ReviewStatus.REJECTED] },
      },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  async submitDecision(
    ticketId: string,
    reviewerId: string,
    decision: 'APPROVE' | 'REJECT',
    notes?: string,
  ): Promise<{ ticket: any; executionResult?: ExecutionResult }> {
    const ticket = await this.prisma.reviewTicket.findUnique({
      where: { id: ticketId },
      include: { auditRecord: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Review ticket with ID ${ticketId} not found.`);
    }

    if (ticket.status !== ReviewStatus.PENDING && ticket.status !== ReviewStatus.IN_REVIEW) {
      throw new BadRequestException(`Ticket is already processed with status: ${ticket.status}`);
    }

    const reviewerDecision = decision === 'APPROVE' ? ReviewDecision.APPROVE : ReviewDecision.REJECT;
    const reviewStatus = decision === 'APPROVE' ? ReviewStatus.APPROVED : ReviewStatus.REJECTED;

    let executionResult: ExecutionResult | undefined;

    // If approved, run executor
    if (decision === 'APPROVE') {
      const parsedRequest = ticket.auditRecord.parsedRequest as any as ParsedRequest;
      executionResult = await this.executor.execute(parsedRequest);
    }

    // Update ticket in database
    const updatedTicket = await this.prisma.reviewTicket.update({
      where: { id: ticketId },
      data: {
        status: reviewStatus,
        assignedTo: reviewerId,
        reviewerNotes: notes,
        reviewerDecision,
        reviewedAt: new Date(),
      },
    });

    // Update the Audit Record with the review outcome and execution details
    const finalDecision: Decision = {
      ...(ticket.auditRecord.decisionRecord as any),
      verdict: decision === 'APPROVE' ? 'APPROVE' : 'BLOCK',
      reasoning: decision === 'APPROVE'
        ? `Escalated request approved by human reviewer ${reviewerId}.`
        : `Escalated request rejected by human reviewer ${reviewerId}.`,
      metadata: {
        decisionMaker: 'HUMAN_REVIEWER',
        decisionMakerId: reviewerId,
        overrideReason: notes,
        appliedPolicies: [],
      } as any,
    };

    // Update the AuditRecord and heal the cryptographic chain!
    const updatedAudit = await this.auditService.updateRecordAndRecalculate(ticket.requestId, {
      decisionRecord: finalDecision,
      executionResult: executionResult || {
        requestId: ticket.requestId,
        success: false,
        response: null,
        executionTimeMs: 0,
        error: 'Rejected by reviewer.',
      },
    });

    return { ticket: updatedTicket, executionResult };
  }
}
