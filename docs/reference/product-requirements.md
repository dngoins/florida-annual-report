# Product Requirements (PRD)

## User Personas

| Persona | Description |
|---------|-------------|
| Small business owner | Files annually for their own entity; needs guided, simple UX |
| Corporate compliance officer | Manages multiple entities; needs batch filing and audit trails |
| Registered agent service | Files on behalf of many clients; needs role-based access |
| CPA / law firm | Reviews and approves filings on behalf of clients |

## Core Workflows

### Workflow 1: Intake

Ensure the user is guided through a seamless document submission process. Provide a sidebar with clear instructions and a chatbot to answer questions about any field.

**Steps:**
- Upload Articles of Incorporation (PDF/DOCX)
- OR fall back to manual field entry

### Workflow 2: Extraction

- Parse uploaded document
- Identify named entities (company, agent, officers, addresses)
- Score confidence per field

### Workflow 3: Reconciliation

- Scrape current Sunbiz record for the entity
- Compare extracted data vs. current Sunbiz state
- Present a diff UI highlighting discrepancies

### Workflow 4: Editing

- Present editable form matching the Sunbiz layout exactly
- Highlight fields that differ from the current Sunbiz record
- All changes logged

### Workflow 5: Submission

- Require explicit user approval before triggering automation
- Trigger Playwright-based submission agent
- Pause at CAPTCHA / payment for human completion

### Workflow 6: Post-Filing

Capture and store immutably:
- Confirmation number
- Receipt (PDF / HTML snapshot)
- Timestamp

## Non-Functional Requirements

### Performance

| Metric | Target |
|--------|--------|
| Extraction time | < 30 seconds |
| End-to-end submission | < 5 minutes |

### Security

- AES-256 encryption at rest
- TLS 1.2+ in transit
- OAuth2 authentication
- Role-based access control (RBAC)

### Compliance

- Full audit trail for every action
- Immutable logs (append-only audit table)
- User must acknowledge disclaimer before submission
