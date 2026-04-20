"""
Pytest Configuration and Shared Fixtures

This file contains fixtures available to all pytest tests.
Per CONSTITUTION.md Principle VI: Test-First Development
"""

import pytest
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any


# =============================================================================
# Constants (aligned with CONSTITUTION.md)
# =============================================================================

# Confidence threshold - fields below this must be flagged for human review
CONFIDENCE_THRESHOLD = 0.75

# Filing window (Jan 1 - May 1)
FILING_WINDOW_START = (1, 1)  # (month, day)
FILING_WINDOW_END = (5, 1)


# =============================================================================
# Path Fixtures
# =============================================================================

@pytest.fixture
def project_root() -> Path:
    """Return the project root directory."""
    return Path(__file__).parent.parent


@pytest.fixture
def tests_dir() -> Path:
    """Return the tests directory."""
    return Path(__file__).parent


@pytest.fixture
def src_dir(project_root: Path) -> Path:
    """Return the src directory."""
    return project_root / "src"


# =============================================================================
# Sample Data Fixtures
# =============================================================================

@pytest.fixture
def sample_company() -> Dict[str, Any]:
    """Return a sample company record for testing."""
    return {
        "document_number": "P12345678",
        "name": "Test Corporation Inc.",
        "status": "ACTIVE",
        "filing_type": "FLORIDA PROFIT CORPORATION",
        "principal_address": {
            "street": "123 Main Street",
            "city": "Miami",
            "state": "FL",
            "zip": "33101",
        },
        "mailing_address": {
            "street": "123 Main Street",
            "city": "Miami",
            "state": "FL",
            "zip": "33101",
        },
        "registered_agent": {
            "name": "John Smith",
            "address": {
                "street": "456 Agent Ave",
                "city": "Miami",
                "state": "FL",
                "zip": "33102",
            },
        },
        "officers": [
            {
                "title": "President",
                "name": "Jane Doe",
                "address": {
                    "street": "789 Officer Blvd",
                    "city": "Miami",
                    "state": "FL",
                    "zip": "33103",
                },
            },
        ],
    }


@pytest.fixture
def sample_audit_entry() -> Dict[str, Any]:
    """Return a sample audit log entry for testing."""
    return {
        "user_id": "test-user-001",
        "action_type": "field_edit",
        "entity_id": "P12345678",
        "timestamp": datetime.utcnow().isoformat(),
        "before_state": {"name": "Old Name"},
        "after_state": {"name": "New Name"},
    }


@pytest.fixture
def sample_extraction_result() -> Dict[str, Any]:
    """Return a sample document extraction result for testing."""
    return {
        "document_id": "doc-001",
        "extracted_fields": {
            "company_name": {
                "value": "Test Corporation Inc.",
                "confidence": 0.95,
                "source": "ocr",
            },
            "ein": {
                "value": "12-3456789",
                "confidence": 0.72,  # Below threshold - needs review
                "source": "ocr",
            },
        },
        "needs_review": True,
        "low_confidence_fields": ["ein"],
    }


# =============================================================================
# Validation Fixtures
# =============================================================================

@pytest.fixture
def confidence_threshold() -> float:
    """Return the confidence threshold value."""
    return CONFIDENCE_THRESHOLD


@pytest.fixture
def filing_window() -> Dict[str, tuple]:
    """Return the filing window dates."""
    return {
        "start": FILING_WINDOW_START,
        "end": FILING_WINDOW_END,
    }


# =============================================================================
# Helper Functions
# =============================================================================

def is_within_filing_window(check_date: date) -> bool:
    """Check if a date falls within the Florida filing window (Jan 1 - May 1)."""
    month, day = check_date.month, check_date.day
    start_month, start_day = FILING_WINDOW_START
    end_month, end_day = FILING_WINDOW_END
    
    if month < start_month:
        return False
    if month > end_month:
        return False
    if month == end_month and day > end_day:
        return False
    
    return True


def fields_need_review(extraction_result: Dict[str, Any], threshold: float = CONFIDENCE_THRESHOLD) -> list:
    """Return list of fields that need human review due to low confidence."""
    low_confidence = []
    for field_name, field_data in extraction_result.get("extracted_fields", {}).items():
        if field_data.get("confidence", 0) < threshold:
            low_confidence.append(field_name)
    return low_confidence
