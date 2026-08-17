# Quality Score Metrics & Gates (QUALITY_SCORE.md)

No feature can be merged to `main` or deployed to production unless it passes the quality gate thresholds.

---

## 1. Quality Gate Thresholds

| Dimension | Target Metric | Tool / Command | Verification Freq | Status |
|---|---|---|---|---|
| **Unit Test Coverage** | >= 80% | `npm run api:test -- --coverage` | CI Pipeline | Verified |
| **Lint / Style Errors** | 0 warnings / errors | `npm run lint` | Pre-commit / CI | Verified |
| **Type Integrity** | 0 compilation errors | `npx tsc --noEmit` | Pre-commit / CI | Verified |
| **Performance Budget** | Intercept response < 5ms | `npm run test:perf` | Post-deploy | Verified |
| **Accessibility (WCAG)**| WCAG 2.1 AA | Lighthouse / Axe | Automated Web | Verified |

---

## 2. Test Execution Protocols

*   **Unit Tests**: Run mock-based unit tests to test business logic quickly.
*   **End-to-End Tests**: Verify multi-service loops (NestJS -> Redis -> Python -> DB).
*   **Property-Based Testing**: Use `fast-check` for testing compliance rules under random parameters.
