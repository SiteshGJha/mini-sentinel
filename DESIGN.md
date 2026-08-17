# Design Guidelines & System Specifications (DESIGN.md)

Guidelines for establishing interface designs, API contracts, schema validation, and state flows.

---

## 1. API Contract Guidelines

All new HTTP endpoints must adhere to:

*   **RESTful Standards**: Proper HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`).
*   **Idempotency**: Use custom `Idempotency-Key` headers for state-changing operations.
*   **Validation**: Every request body must be parsed and validated using Zod schemas.
*   **Versioning**: Prefix endpoints with `/api/v1/`.

---

## 2. Interface Design & Visual Standards

Our visual principles prioritize premium aesthetics:
*   **Color Palette**: Sleek dark mode by default. Tailored HSL color values, glassmorphism, dynamic transitions, and modern sans-serif typography (e.g., *Inter* or *Outfit*).
*   **UX Responsiveness**: Flexbox/CSS Grid structures that adapt elegantly across devices.
*   **Interactive States**: Micro-animations on buttons and hover cards to increase user engagement.

---

## 3. Data Flow & Schema Validation

Ensure that:
1.  All database migrations are defined in Prisma.
2.  Types are auto-generated from schemas.
3.  Error structures are standardized with RFC 7807 problem details.
