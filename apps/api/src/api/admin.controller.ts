import { Controller, Get, Post, Put, Body, Param, Res, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ReviewService } from '../workflow/review.service';
import { ConfigurationService } from '../config/configuration.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../integration/metrics.service';
import { RuleType, RuleCategory, RuleOperator, RuleAction } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('api/v1')
export class AdminController {
  constructor(
    private reviewService: ReviewService,
    private configService: ConfigurationService,
    private auditService: AuditService,
    private metricsService: MetricsService,
  ) {}

  // 1. Pending reviews list
  @Get('review/pending')
  @ApiOperation({ summary: 'Retrieve list of all pending human review tickets' })
  @ApiResponse({ status: 200, description: 'List of pending tickets returned successfully.' })
  async getPendingReviews(@Res() reply: FastifyReply) {
    const tickets = await this.reviewService.getPending();
    return reply.status(HttpStatus.OK).send(tickets);
  }

  // 2. Reviews history
  @Get('review/history')
  @ApiOperation({ summary: 'Retrieve list of all resolved/history human review tickets' })
  @ApiResponse({ status: 200, description: 'Review history list returned successfully.' })
  async getReviewsHistory(@Res() reply: FastifyReply) {
    const tickets = await this.reviewService.getHistory();
    return reply.status(HttpStatus.OK).send(tickets);
  }

  // 3. Process human review decision
  @Post('review/decide')
  @ApiOperation({ summary: 'Submit reviewer decision for an escalated ticket (APPROVE or REJECT)' })
  @ApiResponse({ status: 200, description: 'Decision processed, target tool executed if approved, and audit ledger healed.' })
  async submitReviewDecision(
    @Body() body: { ticketId: string; reviewerId: string; decision: 'APPROVE' | 'REJECT'; notes?: string },
    @Res() reply: FastifyReply,
  ) {
    if (!body.ticketId || !body.reviewerId || !body.decision) {
      return reply.status(HttpStatus.BAD_REQUEST).send({
        error: 'Missing required parameters: ticketId, reviewerId, decision',
      });
    }

    const result = await this.reviewService.submitDecision(
      body.ticketId,
      body.reviewerId,
      body.decision,
      body.notes,
    );

    return reply.status(HttpStatus.OK).send(result);
  }

  // 4. Get active compliance rules
  @Get('config/rules')
  @ApiOperation({ summary: 'Retrieve list of all active compliance validation rules' })
  @ApiResponse({ status: 200, description: 'List of compliance rules returned successfully.' })
  async getRules(@Res() reply: FastifyReply) {
    const rules = this.configService.getRules();
    return reply.status(HttpStatus.OK).send(rules);
  }

  // 5. Create compliance rule dynamically
  @Post('config/rules')
  @ApiOperation({ summary: 'Dynamically create and register a new compliance validation rule' })
  @ApiResponse({ status: 201, description: 'Compliance rule created and cached successfully.' })
  async createRule(
    @Body()
    body: {
      name: string;
      description?: string;
      type: RuleType;
      category: RuleCategory;
      field: string;
      operator: RuleOperator;
      value: any;
      action: RuleAction;
      createdBy: string;
    },
    @Res() reply: FastifyReply,
  ) {
    const rule = await this.configService.createRule({
      name: body.name,
      description: body.description || null,
      type: body.type,
      category: body.category,
      enabled: true,
      priority: 10,
      field: body.field,
      operator: body.operator,
      value: body.value,
      conditions: null,
      action: body.action,
      actionParams: null,
      effectiveFrom: new Date(),
      effectiveTo: null,
      createdBy: body.createdBy,
      updatedBy: body.createdBy,
    });

    return reply.status(HttpStatus.CREATED).send(rule);
  }

  // 6. Update rule
  @Put('config/rules/:id')
  @ApiOperation({ summary: 'Update parameters or toggle enabled state of an existing compliance rule' })
  @ApiResponse({ status: 200, description: 'Compliance rule updated and configurations reloaded.' })
  async updateRule(
    @Param('id') id: string,
    @Body() body: any,
    @Res() reply: FastifyReply,
  ) {
    await this.configService.updateRule(id, body);
    return reply.status(HttpStatus.OK).send({ message: 'Rule updated successfully' });
  }

  // 6.1. Update config parameter
  @Put('config/:key')
  @ApiOperation({ summary: 'Update a global system configuration setting (e.g., execution_mode)' })
  @ApiResponse({ status: 200, description: 'Configuration setting value updated successfully.' })
  async updateConfig(
    @Param('key') key: string,
    @Body() body: { value: any },
    @Res() reply: FastifyReply,
  ) {
    if (body.value === undefined) {
      return reply.status(HttpStatus.BAD_REQUEST).send({ error: 'Missing value in request body.' });
    }
    await this.configService.updateConfig(key, body.value);
    return reply.status(HttpStatus.OK).send({ message: `Configuration '${key}' updated successfully.` });
  }

  // 7. Verify hash chain integrity
  @Get('audit/verify')
  @ApiOperation({ summary: 'Run SHA-256 hash chaining audit trail validation checks' })
  @ApiResponse({ status: 200, description: 'Returns boolean status representing if the ledger is verified and untampered.' })
  async verifyAuditTrail(@Res() reply: FastifyReply) {
    const result = await this.auditService.verifyChain();
    return reply.status(HttpStatus.OK).send(result);
  }

  // 7.1. Get all audit records
  @Get('audit/records')
  @ApiOperation({ summary: 'Retrieve list of all ledger audit record blocks' })
  @ApiResponse({ status: 200, description: 'Full immutable audit records list returned successfully.' })
  async getAuditRecords(@Res() reply: FastifyReply) {
    const records = await this.auditService.getChainRecords();
    return reply.status(HttpStatus.OK).send(records);
  }

  // 8. Get metrics summary
  @Get('metrics')
  @ApiOperation({ summary: 'Retrieve gateway performance and rule trigger metrics' })
  @ApiResponse({ status: 200, description: 'Gateway processing times and rule violation metrics returned successfully.' })
  async getMetrics(@Res() reply: FastifyReply) {
    const summary = this.metricsService.getMetricsSummary();
    const alerts = this.metricsService.getAlerts();
    return reply.status(HttpStatus.OK).send({
      ...summary,
      alertsCount: alerts.length,
      alerts,
    });
  }

  // 9. Reset system database
  @Post('system/reset')
  @ApiOperation({ summary: 'Reset database, purge audit/review records, and re-seed clean default policies' })
  @ApiResponse({ status: 200, description: 'Database reset and clean seeds applied successfully.' })
  async resetSystem(@Res() reply: FastifyReply) {
    await this.configService.resetDatabase();
    return reply.status(HttpStatus.OK).send({ message: 'System database reset and seeded successfully.' });
  }
}
