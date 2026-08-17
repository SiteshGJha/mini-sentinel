# Feature Roadmap & Plan Registry (PLANS.md)

Tracking the lifecycle of all ideas, from concept to production.

---

## 1. Feature Lifecycle Tracker

| Feature Name | Phase / Stage | Product Spec | Design Doc | Exec Plan | Target Release | Status |
|---|---|---|---|---|---|---|
| *Example: Async Redactor* | Stage 10 | [Spec](file:///docs/product-specs/async-redactor.md) | [Design](file:///docs/design-docs/async-redactor.md) | [Plan](file:///docs/exec-plans/completed/async-redactor.md) | Q3 2026 | Completed |

---

## 2. Technical Debt Tracker

We track tech debt as first-class items. Do not hide debt in comments; register it here.

| Debt Description | Affected Components | Severity (High/Med/Low) | Remediation Plan | Status |
|---|---|---|---|---|
| *Example: Presidio TCP Fallback* | `apps/api/src/validation` | Med | Implement local regex parsing if TCP connection fails | Resolved |
| *PII Socket Timeout Handling* | `apps/api/src/validation` | High | Add explicit connect and read timeouts for Socket | Open |
