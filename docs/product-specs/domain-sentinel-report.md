# Domain Sentinel Report Product Spec

## 1. Goal Description
The **Domain Sentinel Report** is the core audit and compliance reporting capability of Mini-Sentinel. It intercepts AI agent tool executions, validates compliance rules (Reg F call limits, time-window constraints, Qualified Mortgage DTI, and OFAC sanctions), redacts PII using natural language processing (NLP), and logs all results into a cryptographically secure, immutable PostgreSQL ledger. 

This spec defines how these intercepted records are formatted, validated, monitored, and audited via the gateway dashboards.

---

## 2. Product Sense Verification

*   **User Persona**:
    *   *Compliance Officer*: Ensures outreach and underwriting agents adhere to federal consumer protection laws (e.g., Fair Debt Collection Practices Act / Reg F, Consumer Financial Protection Bureau regulations).
    *   *IT Auditor / Security Engineer*: Verifies the integrity of the audit chain to ensure no logs were modified or deleted.
*   **Smallest Valuable Outcome (SVO)**:
    A secure intercept gateway that runs asynchronous PII redaction and compliance rule checks, exposes verification logs, and maintains a cryptographic ledger chain with live validation.
*   **Success Metrics**:
    *   *Audit Integrity*: 100% of intercepted tool invocations correctly logged and chained.
    *   *Compliance Enforcement*: 0 non-compliant tool executions approved.
    *   *System Overhead*: Under 5ms response time for initial gateway intercept response (`202 Accepted`).
*   **Assumptions & Risks**:
    *   *Assumption*: The Python Presidio service is highly available; if offline, NestJS gateway must fallback gracefully to local regex-based heuristics without blocking requests.
    *   *Risk*: Database compromise could allow attackers to alter audit records. *Mitigation*: sequential SHA-256 block hashing detects any unauthorized historical edits immediately.

---

## 3. User Stories & Acceptance Criteria

*   **Story 1: Interception and Audit Trail Log**
    *   As a *Compliance Officer*, I want every AI agent tool execution request to be intercepted and audited, so that I have a complete history of parameters, risk scores, and compliance verdicts.
    *   *Acceptance Criteria*:
        *   Post requests to `/api/v1/intercept` must return a `202 Accepted` status with a unique request ID.
        *   Parameters must go through the Python-Presidio TCP scanner on port `50051`.
        *   Redacted parameters must be stored in the database alongside the raw parameters.
        *   The transaction record must be appended as a new block in the PostgreSQL audit chain.

*   **Story 2: Regulatory Rule Validation (Reg F & QM)**
    *   As a *Financial Risk Manager*, I want dialer and loan underwriter tool requests to be verified against specific compliance thresholds before execution, so that our organization avoids severe regulatory fines.
    *   *Acceptance Criteria*:
        *   Dialer requests must be blocked if contact attempts exceed 7 in a rolling 7-day period.
        *   Dialer requests must be blocked if the local time is outside the permitted hours of 08:00 - 21:00.
        *   Underwriter requests must trigger an escalation or block if the customer's Debt-to-Income (DTI) ratio exceeds 43%.
        *   OFAC checking must block requests where customer name is flagged on the sanctions watchlist.

*   **Story 3: Cryptographic Integrity Verification**
    *   As an *IT Auditor*, I want a quick way to run a ledger validation check to prove that the stored audit records have not been tampered with or overridden.
    *   *Acceptance Criteria*:
        *   A `GET /api/v1/audit/verify` endpoint must perform a full validation of the SHA-256 hash chain from the genesis block to the head record.
        *   If any database record content is altered, the verification must fail and identify the first tampered record.

---

## 4. Non-Goals
*   Directly execution of third-party API tool calls (the gateway only intercepts, validates, and approves/blocks; execution is handled by the client application).
*   Live user chat interface or notification dispatch (e.g. SMS/email notifications on blocks are out of scope for the gateway).
