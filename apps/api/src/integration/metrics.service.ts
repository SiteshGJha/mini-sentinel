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

  getMetricsSummary() {
    const total = this.recentRequests.length;
    if (total === 0) return { totalRequests: 0, avgLatency: 0, p95Latency: 0, errorRate: 0 };

    const sortedLatencies = [...this.recentRequests].map((r) => r.latency).sort((a, b) => a - b);
    const sum = sortedLatencies.reduce((a, b) => a + b, 0);
    const avg = sum / total;
    const p95Idx = Math.min(total - 1, Math.floor(total * 0.95));
    const p95 = sortedLatencies[p95Idx];
    const p99Idx = Math.min(total - 1, Math.floor(total * 0.99));
    const p99 = sortedLatencies[p99Idx];

    const failed = this.recentRequests.filter((r) => !r.success).length;
    const errorRate = (failed / total) * 100;

    return {
      totalRequests: total,
      averageLatencyMs: avg,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      errorRate,
    };
  }
}
