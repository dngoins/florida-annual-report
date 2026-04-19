# Agents

This file documents the AI agent architecture used in the Florida Annual Report Automation Platform.

> **Note:** This architecture is modular by design — each agent handles a specific workflow stage, enabling independent scaling and maintainability. May be updated as requirements evolve.

## Agent 1: Ingestion Agent
- Handles document uploads (PDF/DOCX/CSV/Markdown)
- Validates file type and integrity

## Agent 2: Extraction Agent
- Runs OCR (AWS Textract for scanned PDFs) + NLP (spaCy)
- Falls back to LLM extraction when rule-based NER is insufficient
- Outputs structured JSON

## Agent 3: Validation Agent
- Scores confidence per field (rule-based + model-based weighted scoring)
- Flags missing or low-confidence fields for human review

## Agent 4: Reconciliation Agent
- Scrapes live Sunbiz records for the entity
- Produces a structured diff between extracted data and Sunbiz current state

## Agent 5: UI Agent
- Generates form fields dynamically based on entity type
- Highlights changed fields relative to current Sunbiz record

## Agent 6: Automation Agent
- Executes Playwright scripts to submit the annual report on Sunbiz
- Pauses at CAPTCHA and payment steps for human completion

## Agent 7: Audit Agent
- Logs all actions: uploads, edits, submissions, confirmations
- Writes immutable audit records

## Agent 8: Recovery Agent
- Handles failures and retries (up to 3 attempts)
- Escalates to manual mode on persistent failure

## GitHub Actions

See [`.github/workflows/`](.github/workflows/) for CI/CD automation.
