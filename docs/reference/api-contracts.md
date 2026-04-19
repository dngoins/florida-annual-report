# API Contracts

## REST Endpoints

### `POST /documents`

Upload a document for processing.

**Request:** `multipart/form-data` with file field  
**Response:** `{ document_id: string, status: "processing" }`

---

### `POST /extract`

Trigger extraction on an uploaded document.

**Request:** `{ document_id: string }`  
**Response:**
```json
{
  "fields": {
    "entity_name": "...",
    "registered_agent_name": "...",
    "principal_address": "...",
    "officers": [...]
  },
  "confidence": {
    "entity_name": 0.97,
    "registered_agent_name": 0.82,
    "principal_address": 0.91,
    "officers": 0.74
  }
}
```

---

### `GET /company/:id`

Returns the full normalized company record.

**Response:** Complete company object including officers, addresses, and filing history.

---

### `POST /reconcile`

Scrape and compare the current Sunbiz record against extracted data.

**Request:** `{ company_id: string }`  
**Response:** Structured diff showing fields that differ between extracted and Sunbiz state.

---

### `POST /submit`

Triggers the Playwright automation agent to submit the annual report.

**Request:** `{ company_id: string, filing_id: string, user_approved: true }`  
**Response:** `{ submission_id: string, status: "in_progress" }`

> **Requires** `user_approved: true` — submission is blocked without explicit user approval.

---

### `GET /submission/:id`

Returns the status and outcome of a submission.

**Response:**
```json
{
  "status": "confirmed",
  "confirmation_number": "...",
  "receipt_url": "..."
}
```

---

## Internal Functions

| Function | Description |
|----------|-------------|
| `extractCompanyData(file)` | Runs the full extraction pipeline on an uploaded file |
| `normalizeAddress(address)` | Calls USPS API and returns standardized address |
| `compareRecords(extracted, sunbiz)` | Produces a structured diff between two company records |
| `runSubmissionWorkflow(company)` | Orchestrates the full Playwright submission flow |
