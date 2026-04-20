"""
Mock API Responses for External Services

Mocks for:
- AWS Textract (OCR)
- Anthropic Claude (LLM)
- spaCy NER
"""

from dataclasses import dataclass
from typing import Any, Optional


# =============================================================================
# AWS Textract Mock Responses
# =============================================================================

@dataclass
class TextractBlock:
    """Mock Textract block structure."""
    BlockType: str
    Text: str = ""
    Confidence: float = 99.0
    Id: str = ""
    Geometry: Optional[dict] = None


TEXTRACT_HIGH_CONFIDENCE_RESPONSE = {
    "DocumentMetadata": {"Pages": 1},
    "Blocks": [
        {"BlockType": "PAGE", "Id": "page_1"},
        {"BlockType": "LINE", "Text": "ARTICLES OF INCORPORATION OF SUNSHINE TECH LLC", "Confidence": 99.5},
        {"BlockType": "LINE", "Text": "Registered Agent: John Michael Smith", "Confidence": 98.2},
        {"BlockType": "LINE", "Text": "Principal Address: 5678 Corporate Drive, Orlando, FL 32801", "Confidence": 97.8},
        {"BlockType": "LINE", "Text": "President: John Michael Smith", "Confidence": 99.1},
        {"BlockType": "LINE", "Text": "Secretary: Robert Thomas Johnson", "Confidence": 98.5},
    ],
}

TEXTRACT_LOW_CONFIDENCE_RESPONSE = {
    "DocumentMetadata": {"Pages": 1},
    "Blocks": [
        {"BlockType": "PAGE", "Id": "page_1"},
        {"BlockType": "LINE", "Text": "ARTIC1ES 0F |NCORPORAT|ON", "Confidence": 45.2},
        {"BlockType": "LINE", "Text": "Reg|stered Ag3nt: J0hn Sm|th", "Confidence": 38.7},
        {"BlockType": "LINE", "Text": "Pr|nc|pa1 Addr: [UNREADABLE]", "Confidence": 22.1},
    ],
}

TEXTRACT_EMPTY_RESPONSE = {
    "DocumentMetadata": {"Pages": 0},
    "Blocks": [],
}


# =============================================================================
# Anthropic Claude Mock Responses
# =============================================================================

CLAUDE_EXTRACTION_RESPONSE = {
    "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "text",
            "text": """{
  "entity_name": "SUNSHINE TECH LLC",
  "entity_name_confidence": 0.95,
  "registered_agent_name": "John Michael Smith",
  "registered_agent_confidence": 0.92,
  "principal_address": "5678 Corporate Drive, Orlando, FL 32801",
  "principal_address_confidence": 0.88,
  "mailing_address": "P.O. Box 9876, Orlando, FL 32802",
  "mailing_address_confidence": 0.85,
  "officers": [
    {"name": "John Michael Smith", "title": "President"},
    {"name": "Sarah Jane Williams", "title": "Vice President"},
    {"name": "Robert Thomas Johnson", "title": "Secretary"},
    {"name": "Emily Rose Martinez", "title": "Treasurer"}
  ],
  "officers_confidence": 0.90
}""",
        }
    ],
    "model": "claude-3-5-sonnet-20241022",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 500, "output_tokens": 250},
}

CLAUDE_LOW_CONFIDENCE_RESPONSE = {
    "id": "msg_02XFDUDYJgAACzvnptvVoYEL",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "text",
            "text": """{
  "entity_name": "PALM TREE ENTERPRISES LLC",
  "entity_name_confidence": 0.65,
  "registered_agent_name": "John Doe",
  "registered_agent_confidence": 0.60,
  "principal_address": "1234 Beach Rd, Miami, FL 33140",
  "principal_address_confidence": 0.55,
  "mailing_address": null,
  "mailing_address_confidence": 0.0,
  "officers": [
    {"name": "John Doe", "title": "President"}
  ],
  "officers_confidence": 0.50
}""",
        }
    ],
    "model": "claude-3-5-sonnet-20241022",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 400, "output_tokens": 200},
}

CLAUDE_ERROR_RESPONSE = {
    "type": "error",
    "error": {
        "type": "rate_limit_error",
        "message": "Rate limit exceeded. Please try again later.",
    },
}

CLAUDE_MALFORMED_JSON_RESPONSE = {
    "id": "msg_03XFDUDYJgAACzvnptvVoYEL",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "text",
            "text": "I found the entity name SUNSHINE TECH LLC but {invalid json here",
        }
    ],
    "model": "claude-3-5-sonnet-20241022",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 500, "output_tokens": 100},
}


# =============================================================================
# spaCy NER Mock Responses
# =============================================================================

@dataclass
class MockSpacyEntity:
    """Mock spaCy named entity."""
    text: str
    label_: str
    start_char: int
    end_char: int


@dataclass  
class MockSpacyDoc:
    """Mock spaCy Doc object."""
    text: str
    ents: list


SPACY_HIGH_CONFIDENCE_DOC = MockSpacyDoc(
    text="SUNSHINE TECH LLC is registered with John Michael Smith as the agent.",
    ents=[
        MockSpacyEntity("SUNSHINE TECH LLC", "ORG", 0, 17),
        MockSpacyEntity("John Michael Smith", "PERSON", 39, 57),
    ],
)

SPACY_MULTIPLE_ORGS_DOC = MockSpacyDoc(
    text="ACME Corp is represented by Legal Services Inc. The principal is Jane Doe.",
    ents=[
        MockSpacyEntity("ACME Corp", "ORG", 0, 9),
        MockSpacyEntity("Legal Services Inc.", "ORG", 27, 46),
        MockSpacyEntity("Jane Doe", "PERSON", 66, 74),
    ],
)

SPACY_EMPTY_DOC = MockSpacyDoc(
    text="No recognizable entities in this text.",
    ents=[],
)


# =============================================================================
# Validation Service Mock Data
# =============================================================================

VALIDATION_HIGH_CONFIDENCE_INPUT = {
    "documentId": "doc-123",
    "filingId": "fil-456",
    "fields": {
        "entity_name": {
            "value": "SUNSHINE TECH LLC",
            "scores": {
                "ruleBased": 0.90,
                "nerModel": 0.85,
                "llmSignal": 0.80,
            },
        },
        "registered_agent_name": {
            "value": "John Michael Smith",
            "scores": {
                "ruleBased": 0.88,
                "nerModel": 0.82,
                "llmSignal": 0.78,
            },
        },
        "principal_address": {
            "value": "5678 Corporate Drive, Orlando, FL 32801",
            "scores": {
                "ruleBased": 0.85,
                "nerModel": 0.80,
                "llmSignal": 0.75,
            },
        },
        "officers": {
            "value": [{"name": "John Smith", "title": "President"}],
            "scores": {
                "ruleBased": 0.80,
                "nerModel": 0.85,
                "llmSignal": 0.82,
            },
        },
    },
}

VALIDATION_LOW_CONFIDENCE_INPUT = {
    "documentId": "doc-789",
    "filingId": "fil-012",
    "fields": {
        "entity_name": {
            "value": "UNCLEAR NAME LLC",
            "scores": {
                "ruleBased": 0.60,
                "nerModel": 0.55,
                "llmSignal": 0.50,
            },
        },
        "registered_agent_name": {
            "value": "J. Doe",
            "scores": {
                "ruleBased": 0.50,
                "nerModel": 0.45,
                "llmSignal": 0.40,
            },
        },
        "principal_address": {
            "value": "123 Main St, FL",
            "scores": {
                "ruleBased": 0.40,
                "nerModel": 0.35,
                "llmSignal": 0.30,
            },
        },
    },
}

VALIDATION_MIXED_CONFIDENCE_INPUT = {
    "documentId": "doc-456",
    "filingId": "fil-789",
    "fields": {
        "entity_name": {
            "value": "CLEAR COMPANY LLC",
            "scores": {
                "ruleBased": 0.90,
                "nerModel": 0.88,
                "llmSignal": 0.85,
            },
        },
        "registered_agent_name": {
            "value": "Unclear Agent",
            "scores": {
                "ruleBased": 0.55,
                "nerModel": 0.50,
                "llmSignal": 0.45,
            },
        },
    },
}
