# Product Sense & Business Alignment (PRODUCT_SENSE.md)

This document establishes the product validation framework. Every product spec must align with these product sense standards before moving to implementation.

---

## 1. Product Sense Checklist

Before approving any Product Spec, answer the following questions:

1.  **User Persona**: Who is the specific user experiencing this problem?
2.  **Pain Point**: What is the root problem, and why does existing software fail to solve it?
3.  **Measurable Value**: What is the smallest valuable outcome? How do we measure it?
4.  **Differentiation**: Why are we building this instead of using off-the-shelf alternatives?
5.  **Risks & Assumptions**: What must be true for this feature to succeed? What are the failure modes?

---

## 2. Business Impact Framework

We evaluate all features against these key business drivers:

*   **Security & Compliance (Core)**: Minimizing regulatory risk (GDPR, HIPAA, SOC2).
*   **User Retention & Trust**: Ensuring clients trust that their sensitive parameters do not leak to AI models.
*   **System Performance**: Sub-millisecond overhead to keep customer friction minimal.

---

## 3. Product Sense Board

| Feature Name | Primary Persona | Core Pain Point | Success Metric Target | Status |
|---|---|---|---|---|
| *Example: PII Redactor* | Compliance Officer | Financial data leaking to public OpenAI APIs | Zero unmasked SSN/Cards in outbound payloads | In Production |
