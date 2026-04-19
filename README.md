# Florida Annual Report Automation Platform

A production-grade system that automates Florida Annual Report filings for businesses and corporations.

## Objective

Automate Florida Annual Report filings using:
- Document ingestion (Articles of Incorporation)
- AI-driven data extraction
- Human validation workflows
- Browser automation for Sunbiz submission

## Critical Constraint

Sunbiz **does not** provide a public API.

All submissions must occur via:
- Browser automation (Playwright)
- Or human-assisted submission

## System Capabilities

- Extract structured corporate data from PDF/DOCX
- Reconcile with official Sunbiz records
- Provide editable UI matching Sunbiz form layout
- Automate submission via Playwright
- Capture receipts and confirmations
- Maintain full audit logs

## Design Philosophy

- **Human-in-the-loop** at critical steps
- **Fail-safe automation** — never silent failure
- **Compliance-first** design

## Documentation

See [`docs/`](docs/README.md) for the full reference documentation.

| Document | Description |
|----------|-------------|
| [Regulatory Requirements](docs/reference/regulatory-requirements.md) | Florida filing rules, deadlines, fees |
| [Product Requirements (PRD)](docs/reference/product-requirements.md) | User workflows, personas, NFRs |
| [System Architecture](docs/reference/architecture.md) | Services, data flow, infrastructure |
| [Data Model & Field Mapping](docs/reference/data-model.md) | Schema, extraction mapping, confidence model |
| [Document Extraction Pipeline](docs/reference/document-extraction.md) | OCR, NLP, LLM extraction |
| [Sunbiz Integration](integrations/sunbiz/README.md) | Playwright automation strategy |
| [API Contracts](docs/reference/api-contracts.md) | REST endpoints and internal functions |
| [Risk & Compliance](docs/reference/risk-compliance.md) | Legal risks, security, disaster recovery |
