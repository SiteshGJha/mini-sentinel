# Domain Sentinel Report Rollout Execution Plan

This execution plan outlines the tasks, timeline, risks, and rollback instructions for rolling out the **Domain Sentinel Report** auditing and ledger compliance reporting feature.

---

## 1. Task Breakdown & Owner Matrix

| Task ID | Task Description | Domain | Owner | Est. Effort | Status |
|---|---|---|---|---|---|
| T1 | Intercept API Schema & Gateway queue logic | Backend | BE Team | 1.0d | Completed |
| T2 | Python Presidio TCP client integration & local fallback heuristics | Backend | BE Team | 1.0d | Completed |
| T3 | Cryptographic ledger hashing chain (SHA-256) | Security | Security | 0.5d | Completed |
| T4 | Live audit dashboard logs, review queue, & policy configurations | Frontend | FE Team | 1.5d | Completed |
| T5 | System E2E pipeline integration testing | QA | QA | 0.5d | Completed |
| T6 | Deploy staging and run live simulation audits | Platform | DevOps | 0.5d | Todo |

---

## 2. Release & Rollout Strategy

*   **Deployment Stages**:
    1.  **Staging Environment Validation**: Run the Next.js simulator tab with standard presets to verify end-to-end integration (Gateway -> Redis -> Worker -> Python PII TCP service -> Postgres).
    2.  **Canary Rollout (5% of API Traffic)**: Deploy the gateway middleware to production, guarding enqueuing behind the feature flag `ENABLE_COMPLIANCE_GATEWAY`.
    3.  **Gradual Ramp**: Increase traffic to 25%, 50%, and finally 100% over a 48-hour window, monitoring p99 response times and Redis queue depths.

*   **Telemetry & Verification Metrics**:
    *   `sentinel_gateway_intercept_latency_ms`: Target average < 2ms.
    *   `sentinel_worker_job_processing_time_ms`: Target average < 150ms.
    *   `sentinel_audit_tamper_failures_total`: Target: 0.

---

## 3. Risks & Rollback Runbook

*   **Risk 1: Redis Queue Backlog Growth**
    *   *Indicator*: Dequeue processing latency increases; worker container CPU exceeds 80%.
    *   *Mitigation*: Scale background worker replicas horizontally in Kubernetes from 2 to 5 nodes.
*   **Risk 2: Postgres Database Write Lock on Hash Chain**
    *   *Indicator*: Deadlocks or database connection pool exhaustion on the `AuditRecord` table due to sequential hash chaining.
    *   *Mitigation*: Temporary toggle execution mode to `OBSERVE` to audit without blocking operations, or trigger the rollback procedure below.

### Rollback Runbook
If critical failures are detected in production:
1.  Disable the feature flag via ConfigCat/LaunchDarkly (`ENABLE_COMPLIANCE_GATEWAY = false`).
2.  If the flag is unreachable, roll back the API deployment via git tag:
    ```bash
    git checkout tags/last-stable
    docker compose up -d --build api worker
    ```
3.  Monitor logs immediately to verify databases are healthy:
    ```bash
    docker compose logs -f postgres redis
    ```
