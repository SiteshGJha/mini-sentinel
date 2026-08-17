# Security Policy & Controls (SECURITY.md)

Our security model safeguards sensitive financial data processing.

---

## 1. Security Checklist

- [ ] **Authentication & Authorization**: Verify that requests carry valid tokens.
- [ ] **Input Validation**: Use schemas (Zod/Prisma) to prevent SQL Injection and XSS.
- [ ] **Secrets Management**: Secrets are stored in vaults/environment variables; no hardcoded credentials.
- [ ] **Dependency Scanning**: `npm audit` and `pip-audit` run in CI pipelines.
- [ ] **OWASP Top 10 Compliance**: Regular audits of auth, data exposure, and SSRF.
- [ ] **Data Retention & Privacy**: PII is redacted *before* passing outbound. Logs contain no raw PII.

---

## 2. Cryptographic Integrity

For the NestJS ledger gateway:
*   Verdicts must be chained via SHA-256 block-hashing.
*   The hash signature is calculated using standard cryptography:
    $$\text{Hash}_{n} = \text{SHA256}(\text{Data}_{n} \parallel \text{Hash}_{n-1})$$
*   Any manipulation of historic records breaks the hash link validation.

---

## 3. Reporting Vulnerabilities

If you discover a security vulnerability, please do NOT create a public issue. Email security@example.com with details and reproduction steps.
