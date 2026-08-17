# Queue Transparency & Metrics Fix Execution Plan

## 1. Task Breakdown & Owner Matrix

| Task ID | Task Description | Domain | Owner | Est. Effort | Status |
|---|---|---|---|---|---|
| T1 | Implement DB-backed metrics summary in `MetricsService` and update `AdminController` to await it | Backend | BE | 2h | Todo |
| T2 | Implement status polling in `handleSimulationSubmit` in `page.tsx` | Frontend | FE | 2h | Todo |
| T3 | Build the "Active Processing Pool" queue list card in the Simulator tab | Frontend | FE | 2h | Todo |
| T4 | Fix NaN% division bug when requestCount is 0, and add pool status to sidebar | Frontend | FE | 1h | Todo |

## 2. Release & Rollout Strategy
*   **Verification**: Run end-to-end simulation submissions and verify that:
    1. Polling executes and stops when the verdict resolves.
    2. Active processing pool list matches PENDING database records.
    3. Statistics dashboard is non-NaN and correctly sums up DB records.
*   **Deployment**: Merged into main branch.

## 3. Risks & Rollback Runbook
*   **Risk**: Potential performance issue with database queries on large audit logs.
  - *Mitigation*: The metric query uses basic aggregation. If log sizes grow massive, a cache or materialized view can be added (out of scope for this MVP).
*   **Rollback Command**:
    ```bash
    git checkout docs/product-specs/queue-transparency--metrics-fix.md docs/design-docs/queue-transparency--metrics-fix/index.md docs/exec-plans/active/queue-transparency--metrics-fix-v1.md
    git checkout apps/api/src/integration/metrics.service.ts apps/api/src/api/admin.controller.ts apps/web/src/app/page.tsx
    ```
