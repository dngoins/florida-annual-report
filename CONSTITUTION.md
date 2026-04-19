# Florida Annual Report Automation Platform — Constitution

> This constitution defines the governing principles for all development on this platform. It supersedes all other practices where conflicts arise. Amendments require documentation, team approval, and a migration plan.

---

## Core Principles

### I. Compliance-First (NON-NEGOTIABLE)

Every feature, workflow, and integration must satisfy Florida regulatory requirements **before** all other considerations.

- Filing window (Jan 1 – May 1) and fee schedules are hard constraints, not configurable UX preferences
- The system must validate completeness of all required fields and **block** submission of invalid or incomplete data
- Incorrect filings create legal liability; missed filings cause dissolution — treat both as system failures
- All user decisions (approvals, overrides, edits) must be logged with timestamps and user identity

### II. Human-in-the-Loop (NON-NEGOTIABLE)

Automation assists humans — it never replaces human judgment at critical steps.

- Submission to Sunbiz **requires** explicit user approval (`user_approved: true`); no exceptions
- CAPTCHA and payment steps **must** pause automation and hand control to the user
- Fields with confidence score < 0.75 **must** be flagged and block submission until manually confirmed
- Every automated action must be reversible or escalatable to manual mode

### III. Fail-Safe Automation

Failures must be loud, logged, and recoverable — never silent.

- All errors must be caught, logged to `audit_logs`, and surfaced to the user or escalation queue
- Playwright automation retries up to 3 times with exponential backoff before escalating to manual mode
- No automation step may proceed past a detected failure without explicit handling
- Recovery Agent must always have a path to human intervention

### IV. Audit Immutability

Every action on the platform produces an immutable, tamper-evident record.

- `audit_logs` is **append-only** — no updates or deletes permitted
- Every record must include: `user_id`, `action_type`, `entity_id`, `timestamp`, `before_state`, `after_state`
- Audit records must be written **before** the action completes (write-ahead logging pattern)
- Receipts and confirmation screenshots are stored permanently in object storage

### V. Selector Resilience (Sunbiz Integration)

The Sunbiz form is controlled by a third party and will change without notice.

- All Sunbiz form selectors **must** be defined in `integrations/sunbiz/selectors.json` — never hardcoded in scripts
- Use label-based matching as the primary strategy; XPath as fallback
- Do not rely on auto-generated element IDs
- Selector failures must trigger a monitoring alert, not a silent error

### VI. Test-First Development

Tests are written before implementation.

- TDD is mandatory: write tests → get approval → tests fail → implement → tests pass
- All new REST endpoints require integration tests
- All extraction pipeline changes require golden-file regression tests
- Confidence scoring changes require benchmark tests against the labelled dataset

### VII. Security by Default

Security is not a phase — it is a prerequisite.

- AES-256 encryption at rest; TLS 1.2+ in transit
- OAuth2 authentication with RBAC and MFA enforced for all user accounts
- Secrets and credentials must never be committed to source control; use environment variables or Azure Key Vault
- Role permissions follow the principle of least privilege

---

## Additional Constraints

### Data Integrity

- Addresses must be normalized via the USPS API before storage; raw unvalidated addresses must not be submitted to Sunbiz
- Entity names must match the Sunbiz record exactly; the system must warn on divergence
- `document_number` is the authoritative entity key; all records must trace back to it

### API Design

- All REST responses use a consistent envelope: `{ status, data, error }`
- The `POST /submit` endpoint **must** reject requests where `user_approved !== true`
- Versioned API paths are required for any breaking change

### Performance Standards

| Operation | Target |
|-----------|--------|
| Document extraction | < 30 seconds end-to-end |
| Sunbiz form submission | < 5 minutes (excluding CAPTCHA/payment pause) |
| API response (non-async) | < 2 seconds p95 |

---

## Development Workflow

1. **Spec first** — create or update the relevant doc in `docs/reference/` before writing code
2. **Branch** — `feature/short-description` or `fix/short-description` off `main`
3. **Tests** — write failing tests before implementation (see Principle VI)
4. **Implementation** — make tests pass; no speculative code
5. **Review** — all PRs require at least one approval; compliance-affecting changes require two
6. **Merge** — squash merge to `main`; no force-pushes to `main`
7. **Changelog** — every merged PR updates `CHANGELOG.md`

---

## Governance

- This constitution supersedes all other practices where conflicts arise
- Amendments require: written proposal, team discussion, approval, and a migration plan documented in `CHANGELOG.md`
- All PRs and code reviews must verify compliance with these principles
- Complexity must be justified; default to simpler solutions (YAGNI)
- Refer to `CLAUDE.md` for runtime AI agent development guidance
- Refer to `AGENTS.md` for the authorized agent architecture

**Version**: 1.0.0 | **Ratified**: 2026-04-19 | **Last Amended**: 2026-04-19
