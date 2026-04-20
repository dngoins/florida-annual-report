# Extraction Service

FastAPI service for document extraction using OCR, NLP, and LLM.

## Overview

The Extraction Service implements a 3-stage pipeline for extracting structured data from Florida Annual Report documents:

1. **Stage 1: OCR** - AWS Textract for scanned PDFs
2. **Stage 2: NER** - spaCy for named entity recognition  
3. **Stage 3: LLM** - Claude fallback for low-confidence fields

## Extracted Fields

| Field | Description |
|-------|-------------|
| `entity_name` | Legal company/entity name |
| `registered_agent_name` | Registered agent's name |
| `principal_address` | Principal business address |
| `mailing_address` | Mailing address |
| `officers` | List of officers/directors with name, title, address |

## Confidence Scoring

Each field receives a confidence score (0.0 - 1.0):
- **Rule-based patterns** (regex): 40% weight
- **NER model confidence**: 40% weight
- **LLM certainty**: 20% weight

Fields with confidence < 0.75 are flagged `needs_review: true` and must be manually confirmed before submission.

## API Endpoints

### `GET /health`
Health check endpoint.

### `POST /documents`
Upload a document for processing.

**Request:** `multipart/form-data` with `file` field  
**Response:**
```json
{
  "status": "success",
  "document_id": "uuid",
  "filename": "articles.pdf"
}
```

### `POST /extract`
Trigger extraction on an uploaded document.

**Request:**
```json
{
  "document_id": "uuid"
}
```

**Response:**
```json
{
  "status": "success",
  "document_id": "uuid",
  "fields": {
    "entity_name": "Company Name LLC",
    "registered_agent_name": "John Smith",
    "principal_address": "123 Main St, Miami, FL 33101",
    "mailing_address": null,
    "officers": [
      {"name": "Jane Doe", "title": "President", "address": "..."}
    ]
  },
  "confidence": {
    "entity_name": 0.95,
    "registered_agent_name": 0.82,
    "principal_address": 0.88,
    "mailing_address": 0.0,
    "officers": 0.76
  },
  "needs_review": {
    "entity_name": false,
    "registered_agent_name": false,
    "principal_address": false,
    "mailing_address": true,
    "officers": false
  },
  "extraction_method": "ner+llm"
}
```

### `POST /extract/text`
Extract from pre-provided text (skips OCR).

**Request:** Form data with `document_id` and `text` fields

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_REGION` | AWS region for Textract | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Yes (for LLM fallback) |
| `PORT` | Server port (default: 8000) | No |

## Development

### Setup

```bash
cd src/services/extraction-service
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### Run Server

```bash
uvicorn main:app --reload --port 8000
```

### Run Tests

```bash
cd /path/to/repo
pytest tests/services/extraction-service/ -v
```

## Architecture

```
extraction-service/
├── main.py                 # FastAPI application
├── requirements.txt        # Python dependencies
├── README.md              # This file
└── extraction/
    ├── __init__.py
    ├── models.py          # Pydantic data models
    ├── ocr.py             # AWS Textract integration
    ├── ner.py             # spaCy NER extraction
    ├── llm.py             # Claude LLM fallback
    └── pipeline.py        # Pipeline orchestration
```

## Security Notes

- Never commit AWS or Anthropic credentials
- Use environment variables or Azure Key Vault
- All extraction actions are logged to audit trail
- Fields flagged `needs_review` must be manually confirmed
