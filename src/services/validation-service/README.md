# Validation Service

The Validation Service implements confidence gating and human review queue management for the Florida Annual Report automation platform.

## Overview

This service ensures that extracted document fields meet quality thresholds before submission to Sunbiz. Fields with low confidence scores are flagged for human review, and submission is blocked until all fields are resolved.

**Key Principle:** Per `CONSTITUTION.md` Human-in-the-Loop principle, submission MUST be blocked when any field is unresolved.

## Confidence Scoring

Each extracted field receives a weighted confidence score based on three components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Rule-based patterns | 40% | Regex and keyword proximity matching |
| NER model confidence | 40% | spaCy entity recognition confidence |
| LLM certainty signal | 20% | Language model extraction confidence |

**Threshold:** Fields with weighted confidence < 0.75 require human review.

Formula:
```
weighted_confidence = (rule_based × 0.4) + (ner_model × 0.4) + (llm_signal × 0.2)
```

## API Endpoints

### POST /validate

Validate extraction output and apply confidence scoring.

**Request:**
```json
{
  "documentId": "doc-123",
  "filingId": "filing-456",
  "fields": {
    "entity_name": {
      "value": "Florida Test Corp LLC",
      "scores": {
        "ruleBased": 0.95,
        "nerModel": 0.92,
        "llmSignal": 0.88
      }
    },
    "registered_agent_name": {
      "value": "John Smith",
      "scores": {
        "ruleBased": 0.50,
        "nerModel": 0.60,
        "llmSignal": 0.40
      }
    }
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "documentId": "doc-123",
    "filingId": "filing-456",
    "fields": {
      "entity_name": {
        "fieldName": "entity_name",
        "value": "Florida Test Corp LLC",
        "weightedConfidence": 0.914,
        "status": "validated",
        "meetsThreshold": true
      },
      "registered_agent_name": {
        "fieldName": "registered_agent_name",
        "value": "John Smith",
        "weightedConfidence": 0.52,
        "status": "needs_review",
        "meetsThreshold": false
      }
    },
    "summary": {
      "totalFields": 2,
      "validatedFields": 1,
      "needsReviewFields": 1,
      "averageConfidence": 0.717
    },
    "canSubmit": false,
    "reviewQueueItems": [
      {
        "id": "uuid-...",
        "fieldName": "registered_agent_name",
        "extractedValue": "John Smith",
        "confidence": 0.52,
        "status": "pending"
      }
    ]
  }
}
```

### GET /review-queue

List all fields pending human review.

**Query Parameters:**
- `filingId` (optional) - Filter by filing ID
- `documentId` (optional) - Filter by document ID

**Response:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "review-item-uuid",
        "documentId": "doc-123",
        "filingId": "filing-456",
        "fieldName": "registered_agent_name",
        "extractedValue": "John Smith",
        "confidence": 0.52,
        "componentScores": {
          "ruleBased": 0.50,
          "nerModel": 0.60,
          "llmSignal": 0.40
        },
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

### PATCH /review-queue/:field_id

Accept or reject a human-reviewed value.

**Request (Accept with correction):**
```json
{
  "action": "accept",
  "correctedValue": "John A. Smith",
  "reviewerId": "user-123",
  "reason": "Added middle initial from source document"
}
```

**Request (Accept without correction):**
```json
{
  "action": "accept",
  "reviewerId": "user-123",
  "reason": "Verified against source"
}
```

**Request (Reject):**
```json
{
  "action": "reject",
  "reviewerId": "user-123",
  "reason": "Cannot determine correct value from source document"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "review-item-uuid",
    "fieldName": "registered_agent_name",
    "status": "accepted",
    "finalValue": "John A. Smith",
    "reviewedBy": "user-123",
    "reviewedAt": "2024-01-15T11:00:00Z"
  }
}
```

### GET /submission-check/:filing_id

Check if submission is allowed for a filing.

**Response (200 - Allowed):**
```json
{
  "status": "success",
  "data": {
    "allowed": true,
    "filingId": "filing-456"
  }
}
```

**Response (403 - Blocked):**
```json
{
  "status": "error",
  "error": {
    "code": "UNRESOLVED_FIELDS",
    "message": "Submission blocked: 2 field(s) require human review",
    "unresolvedFields": ["registered_agent_name", "principal_address"]
  }
}
```

## Usage

### Express Integration

```typescript
import express from 'express';
import { createValidationRouter, ValidationService } from './services/validation-service';

const app = express();
app.use(express.json());

// Create service and router
const validationService = new ValidationService();
const validationRouter = createValidationRouter(validationService);

// Mount routes
app.use('/api/validation', validationRouter);

app.listen(3000, () => {
  console.log('Validation service running on port 3000');
});
```

### Programmatic Usage

```typescript
import { ValidationService } from './services/validation-service';

const service = new ValidationService();

// Validate extraction output
const result = await service.validateExtraction({
  documentId: 'doc-123',
  filingId: 'filing-456',
  fields: {
    entity_name: {
      value: 'Test Corp',
      scores: { ruleBased: 0.9, nerModel: 0.9, llmSignal: 0.9 }
    }
  }
});

if (result.data?.canSubmit) {
  // Proceed with submission
} else {
  // Handle fields needing review
}

// Check before submission
const check = await service.checkSubmissionAllowed('filing-456');
if (check.httpStatus === 403) {
  // Block submission, show review UI
}
```

## Testing

Run the test suite:

```bash
npm test -- --testPathPattern=validation-service
```

Test files:
- `tests/services/validation-service/confidence-scoring.test.ts` - Unit tests for weighted scoring
- `tests/services/validation-service/review-queue.test.ts` - Unit tests for queue management
- `tests/services/validation-service/api.test.ts` - Integration tests for API endpoints

## Audit Trail

All review actions are logged in an append-only audit trail:

```typescript
const audit = await service.getAuditTrail('filing-456');
// Returns array of audit entries with timestamps, reviewers, and actions
```

## Configuration

The confidence threshold can be customized per validation request:

```typescript
await service.validateExtraction({
  documentId: 'doc-123',
  filingId: 'filing-456',
  fields: { ... },
  threshold: 0.8  // Override default 0.75 threshold
});
```

## Related Documentation

- `docs/reference/document-extraction.md` - Confidence scoring model
- `docs/reference/product-requirements.md` - Human review workflows
- `CONSTITUTION.md` - Human-in-the-Loop principle
