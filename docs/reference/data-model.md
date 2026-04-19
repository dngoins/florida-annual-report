# Data Model & Field Mapping

## Schema

### `companies` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `entity_name` | string | Legal entity name |
| `document_number` | string | Sunbiz-assigned document number |
| `principal_address` | string | Principal place of business |
| `mailing_address` | string | Mailing address (may differ) |
| `registered_agent_name` | string | Name of registered agent |
| `registered_agent_address` | string | Florida address of registered agent |
| `created_at` | timestamp | Record creation time |

### `officers` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `company_id` | UUID | FK → companies |
| `name` | string | Officer/director name |
| `title` | string | Title (e.g., President, Director) |
| `address` | string | Officer's address |

### `filings` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `company_id` | UUID | FK → companies |
| `year` | int | Filing year |
| `status` | enum | pending / submitted / confirmed / rejected |
| `submitted_at` | timestamp | Submission timestamp |
| `confirmation_number` | string | Sunbiz confirmation number |

---

## Field Mapping Logic

### Extraction → Schema Mapping

| Extracted Text Pattern | Target Field |
|------------------------|--------------|
| "Registered Agent" label | `registered_agent_name` |
| Address block (primary) | `principal_address` |
| Officer/Director list | `officers[]` |
| Entity name header | `entity_name` |
| Document number / filing ID | `document_number` |

---

## Address Normalization

All addresses are standardized via the **USPS Address Verification API** before storage:
- Expanded abbreviations (e.g., `ST` → `STREET`)
- ZIP+4 appended where available
- State code normalized to two-letter format

---

## Confidence Model

Each extracted field receives a confidence score (0.0 – 1.0):

| Method | Weight |
|--------|--------|
| Regex / pattern match | 40% |
| spaCy NER model score | 40% |
| LLM extraction certainty | 20% |

Fields below a configurable threshold (default: `0.75`) are flagged for mandatory human review before submission is enabled.
