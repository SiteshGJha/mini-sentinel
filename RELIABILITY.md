# Reliability Engineering & Runbooks (RELIABILITY.md)

Production readiness checklist for ensuring service resilience.

---

## 1. Reliability Checklist

- [ ] **SLO/SLA Defined**: Operational thresholds are documented and alerted.
- [ ] **Health Checks**: API has `/health` endpoint reflecting DB, Redis, and Python connectivity.
- [ ] **Timeouts & Retries**: External queries (e.g. to `pii-service`) have timeout protection and exponential backoff retry.
- [ ] **Circuit Breakers**: If the Python service fails repeatedly, fallback to local heuristics.
- [ ] **Database Backups**: Daily automated snapshots configured.
- [ ] **Rollback Tested**: One-command automated rollback exists and has been tested.
- [ ] **Monitoring & Alerting**: Logging level defined. Alarms trigger on error rates > 1%.

---

## 2. Service Level Objectives (SLOs)

*   **Availability**: 99.9% uptime for `/api/v1/intercept`.
*   **Latency**: P95 response time < 5ms (without NLP queue time), P99 < 15ms.
*   **Fallback Reliability**: 100% failover to local regex rules if the NLP socket server is unresponsive.

---

## 3. Disaster Recovery & Rollbacks

### How to Rollback a Release
In case of a faulty API deployment:
```bash
# Example rollback command
git checkout tags/vX.Y.Z
npm run db:migrate:rollback
docker compose up -d --build
```
Verify logs immediately via `docker logs mini_sentinel_postgres` and `docker logs mini_sentinel_redis`.
