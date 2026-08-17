import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MetricType } from '@prisma/client';

export interface AlertTriggered {
  type: 'ERROR_RATE_EXCEEDED' | 'LATENCY_EXCEEDED';
  message: string;
  timestamp: Date;
  value: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private recentRequests: { success: boolean; latency: number; timestamp: Date }[] = [];
  private alerts: AlertTriggered[] = [];

  constructor(private prisma: PrismaService) {}

  async recordRequest(latencyMs: number, success: boolean): Promise<void> {
    const now = new Date();
    this.recentRequests.push({ success, latency: latencyMs, timestamp: now });

    // Keep last 100 requests for rolling rates
    if (this.recentRequests.length > 100) {
      this.recentRequests.shift();
    }

    // Save metrics asynchronously to PostgreSQL
    this.prisma.systemMetric.createMany({
      data: [
        {
          metricType: MetricType.LATENCY,
          metricName: 'request_processing_latency',
          value: latencyMs,
          labels: { success },
        },
        {
          metricType: MetricType.REQUEST_COUNT,
          metricName: 'request_count',
          value: 1.0,
          labels: { success },
        },
      ],
    }).catch((err) => {
      this.logger.error(`Error saving metrics to DB: ${err.message}`);
    });

    // Evaluate Alerting Conditions
    this.evaluateAlerts(latencyMs);
  }

  private evaluateAlerts(currentLatency: number) {
    const now = new Date();

    // 1. Latency Alert Check (> 5ms)
    if (currentLatency > 5.0) {
      const alert: AlertTriggered = {
        type: 'LATENCY_EXCEEDED',
        message: `Performance alert: Processing latency of ${currentLatency.toFixed(2)}ms exceeded the threshold of 5ms`,
        timestamp: now,
        value: currentLatency,
      };
      this.alerts.push(alert);
      this.logger.warn(alert.message);
    }

    // 2. Error Rate Alert Check (> 1% in rolling last 100 requests)
    if (this.recentRequests.length >= 10) {
      const failedCount = this.recentRequests.filter((r) => !r.success).length;
      const errorRate = (failedCount / this.recentRequests.length) * 100;

      if (errorRate > 1.0) {
        const alert: AlertTriggered = {
          type: 'ERROR_RATE_EXCEEDED',
          message: `System alert: Rolling error rate is ${errorRate.toFixed(2)}%, exceeding threshold of 1%`,
          timestamp: now,
          value: errorRate,
        };
        this.alerts.push(alert);
        this.logger.error(alert.message);
      }
    }
  }

  getAlerts(): AlertTriggered[] {
    return this.alerts;
  }

  clearAlerts() {
    this.alerts = [];
  }

  async getMetricsSummary() {
    // 1. Fetch all audit records from database
    const records = await this.prisma.auditRecord.findMany({
      select: {
        receivedAt: true,
        completedAt: true,
        decisionRecord: true,
      },
    });

    const total = records.length;

    // Filter out records that are still PENDING
    const processedRecords = records.filter((r) => {
      const decision = r.decisionRecord as any;
      return decision && decision.verdict !== 'PENDING';
    });

    const totalProcessed = processedRecords.length;

    // Calculate latency for processed records
    const latencies = processedRecords.map((r) => {
      const start = new Date(r.receivedAt).getTime();
      const end = new Date(r.completedAt).getTime();
      return Math.max(0, end - start);
    });

    const avg = totalProcessed > 0 ? latencies.reduce((a, b) => a + b, 0) / totalProcessed : 0;

    // Calculate p95, p99 latency
    let p95 = 0;
    let p99 = 0;
    if (totalProcessed > 0) {
      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p95Idx = Math.min(totalProcessed - 1, Math.floor(totalProcessed * 0.95));
      p95 = sortedLatencies[p95Idx];
      const p99Idx = Math.min(totalProcessed - 1, Math.floor(totalProcessed * 0.99));
      p99 = sortedLatencies[p99Idx];
    }

    // Verdict distribution
    const verdictDistribution = {
      APPROVE: 0,
      BLOCK: 0,
      ESCALATE: 0,
    };

    records.forEach((r) => {
      const decision = r.decisionRecord as any;
      if (decision && decision.verdict) {
        const v = decision.verdict;
        if (v === 'APPROVE') verdictDistribution.APPROVE++;
        else if (v === 'BLOCK') verdictDistribution.BLOCK++;
        else if (v === 'ESCALATE') verdictDistribution.ESCALATE++;
      }
    });

    // Error rate: requests that failed due to internal errors or are blocked due to rules.
    // Let's count blocked requests with internal error reasoning or general error flags.
    const failed = records.filter((r) => {
      const decision = r.decisionRecord as any;
      return (
        decision &&
        (decision.verdict === 'BLOCK' &&
          (decision.reasoning?.toLowerCase().includes('error') ||
            decision.reasoning?.toLowerCase().includes('failed')))
      );
    }).length;
    const errorRate = total > 0 ? (failed / total) * 100 : 0;

    return {
      totalRequests: total,
      requestCount: total, // Frontend expects requestCount
      averageLatencyMs: avg,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      errorRate,
      verdictDistribution,
    };
  }
}
