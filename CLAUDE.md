# CLAUDE.md — Florida Annual Report Automation Platform

This file provides context and conventions for AI agents (Claude, Copilot, etc.) working in this repository.

---

## Project Purpose

Automates Florida Annual Report filings on [Sunbiz.org](https://sunbiz.org) for businesses and corporations. There is **no public Sunbiz API** — all submissions use Playwright browser automation with a mandatory human-in-the-loop step at CAPTCHA and payment.

---

## Repository Structure

```
florida-annual-report/
├── src/                        # Application source code
├── tests/                      # Unit, integration, and e2e tests
├── docs/
│   ├── reference/              # Authoritative specs (read before implementing)
│   │   ├── regulatory-requirements.md
│   │   ├── product-requirements.md
│   │   ├── architecture.md
│   │   ├── data-model.md
│   │   ├── document-extraction.md
│   │   ├── api-contracts.md
│   │   └── risk-compliance.md
│   └── quickstart.md
├── integrations/
│   └── sunbiz/                 # Playwright automation scripts + selectors
├── templates/                  # Spec, plan, and checklist templates
├── workflows/                  # Reusable automation workflow definitions
├── scripts/                    # Dev/ops helper scripts
├── AGENTS.md                   # AI agent architecture reference
├── CONSTITUTION.md             # Project governing principles
└── CLAUDE.md                   # This file
```

---

## Key Reference Documents

Before making any changes, read the relevant spec in `docs/reference/`:

| Topic | File |
|-------|------|
| Regulatory rules & deadlines | `docs/reference/regulatory-requirements.md` |
| User workflows & NFRs | `docs/reference/product-requirements.md` |
| Services & data flow | `docs/reference/architecture.md` |
| DB schema & field mapping | `docs/reference/data-model.md` |
| OCR/NLP/LLM pipeline | `docs/reference/document-extraction.md` |
| REST endpoints | `docs/reference/api-contracts.md` |
| Security & compliance | `docs/reference/risk-compliance.md` |
| Sunbiz automation | `integrations/sunbiz/README.md` |

---

## Architecture Summary

- **Frontend:** Next.js
- **Backend:** Node.js/Python microservices behind an API Gateway
- **Database:** AzureSQL (`companies`, `filings`, `officers`, `submissions`, `audit_logs`)
- **Object Storage:** Azure BLOB + CosmosDB (documents, receipts)
- **OCR:** AWS Textract (scanned PDFs)
- **NLP:** spaCy + LLM fallback
- **Automation:** Playwright (Sunbiz form submission)
- **Auth:** OAuth2 + RBAC + MFA
- **Infra:** Azure, Docker, optional Kubernetes

---

## Critical Constraints

1. **Never submit to Sunbiz without explicit `user_approved: true`** — the submission API endpoint requires this flag.
2. **Always pause at CAPTCHA and payment** — automation must stop and notify the user; never attempt to automate payment.
3. **Audit log every action** — all field edits, uploads, and submission attempts must write to `audit_logs` (append-only).
4. **Confidence gate** — fields with confidence < 0.75 must be flagged for human review; submission must be blocked until resolved.
5. **No silent failures** — all errors must be logged and surfaced to the user or escalation queue.

---

## AI Agent Roles

The system uses 8 specialized agents (see `AGENTS.md` for full detail):

| Agent | Responsibility |
|-------|---------------|
| Ingestion | Upload handling & file validation |
| Extraction | OCR + NLP + LLM field extraction |
| Validation | Confidence scoring & human-review gating |
| Reconciliation | Sunbiz scrape & diff generation |
| UI | Dynamic form rendering |
| Automation | Playwright submission |
| Audit | Immutable action logging |
| Recovery | Retry logic & manual escalation |

---

## Development Commands

> Update this section once the stack is set up.

```bash
# Install dependencies
npm install        # or: pip install -r requirements.txt

# Run tests
npm test           # or: pytest

# Start dev server
npm run dev

# Lint
npm run lint
```

---

## Conventions

- **Branch naming:** `feature/short-description`, `fix/short-description`
- **Commit messages:** Imperative mood, present tense (e.g., `Add extraction confidence gate`)
- **API responses:** Always include `{ status, data, error }` envelope
- **Secrets:** Never commit credentials; use environment variables or Azure Key Vault references
- **Selectors:** Sunbiz selectors live in `integrations/sunbiz/selectors.json` — never hardcode them in scripts
- **Tests:** Write tests before implementation (TDD); all new endpoints need integration tests

---

## Filing Deadlines

The Florida Annual Report filing window is **January 1 – May 1**. The system must enforce this deadline and warn users approaching the cutoff. Late filings result in penalties or administrative dissolution.
