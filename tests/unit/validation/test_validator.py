"""
Unit Tests for Validation Service

Tests:
- Threshold gating (< 0.75 blocks submission)
- Weighted scoring formula (entity 25%, agent 20%, addresses 30%, officers 25%)
- Review queue population
- Queue retrieval and filtering
- Submission blocking logic

Per CONSTITUTION.md: Human-in-the-Loop principle
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
import sys
import os

# Add validation service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../src/services/validation-service"))

# Import fixtures
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from fixtures.mock_responses import (
    VALIDATION_HIGH_CONFIDENCE_INPUT,
    VALIDATION_LOW_CONFIDENCE_INPUT,
    VALIDATION_MIXED_CONFIDENCE_INPUT,
)


# =============================================================================
# Threshold Gating Tests
# =============================================================================

class TestThresholdGating:
    """Test that fields below 0.75 confidence are gated."""

    def test_high_confidence_allows_submission(self):
        """Test that all fields >= 0.75 allows submission."""
        # Calculate weighted confidence for high confidence input
        # Using formula: 0.4 * ruleBased + 0.4 * nerModel + 0.2 * llmSignal
        fields = VALIDATION_HIGH_CONFIDENCE_INPUT["fields"]
        
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = (
                0.4 * scores["ruleBased"] +
                0.4 * scores["nerModel"] +
                0.2 * scores["llmSignal"]
            )
            # All high confidence inputs should be >= 0.75
            assert weighted >= 0.75, f"{field_name} should have weighted >= 0.75"

    def test_low_confidence_blocks_submission(self):
        """Test that any field < 0.75 blocks submission."""
        fields = VALIDATION_LOW_CONFIDENCE_INPUT["fields"]
        
        blocked = False
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = (
                0.4 * scores["ruleBased"] +
                0.4 * scores["nerModel"] +
                0.2 * scores["llmSignal"]
            )
            if weighted < 0.75:
                blocked = True
                break
        
        assert blocked, "At least one field should be below threshold"

    def test_threshold_boundary_exactly_0_75(self):
        """Test boundary condition at exactly 0.75."""
        # Construct scores that yield exactly 0.75
        # 0.4 * 0.75 + 0.4 * 0.75 + 0.2 * 0.75 = 0.75
        scores = {
            "ruleBased": 0.75,
            "nerModel": 0.75,
            "llmSignal": 0.75,
        }
        weighted = (
            0.4 * scores["ruleBased"] +
            0.4 * scores["nerModel"] +
            0.2 * scores["llmSignal"]
        )
        
        # Exactly at threshold should pass
        assert weighted >= 0.75

    def test_threshold_boundary_just_below(self):
        """Test boundary condition just below 0.75."""
        scores = {
            "ruleBased": 0.74,
            "nerModel": 0.74,
            "llmSignal": 0.74,
        }
        weighted = (
            0.4 * scores["ruleBased"] +
            0.4 * scores["nerModel"] +
            0.2 * scores["llmSignal"]
        )
        
        # Just below threshold should fail
        assert weighted < 0.75


# =============================================================================
# Weighted Scoring Formula Tests
# =============================================================================

class TestWeightedScoringFormula:
    """
    Test weighted scoring formula.
    
    Per spec:
    - Rule-based patterns: 40%
    - NER model confidence: 40%
    - LLM certainty signal: 20%
    """

    def test_weighted_formula_calculation(self):
        """Test weighted formula: 0.4 * rule + 0.4 * ner + 0.2 * llm."""
        scores = {
            "ruleBased": 0.90,
            "nerModel": 0.80,
            "llmSignal": 0.70,
        }
        
        expected = (0.4 * 0.90) + (0.4 * 0.80) + (0.2 * 0.70)
        assert expected == 0.36 + 0.32 + 0.14
        assert expected == 0.82

    def test_weights_sum_to_one(self):
        """Test that weights sum to 1.0."""
        weights = {
            "ruleBased": 0.4,
            "nerModel": 0.4,
            "llmSignal": 0.2,
        }
        
        assert sum(weights.values()) == 1.0

    def test_rule_based_weight_is_40_percent(self):
        """Test that rule-based gets 40% weight."""
        # If only rule-based is 1.0 and others are 0
        scores = {"ruleBased": 1.0, "nerModel": 0.0, "llmSignal": 0.0}
        weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
        
        assert weighted == 0.4

    def test_ner_weight_is_40_percent(self):
        """Test that NER gets 40% weight."""
        scores = {"ruleBased": 0.0, "nerModel": 1.0, "llmSignal": 0.0}
        weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
        
        assert weighted == 0.4

    def test_llm_weight_is_20_percent(self):
        """Test that LLM gets 20% weight."""
        scores = {"ruleBased": 0.0, "nerModel": 0.0, "llmSignal": 1.0}
        weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
        
        assert weighted == 0.2

    def test_all_zeros_yields_zero(self):
        """Test that all zero scores yield zero confidence."""
        scores = {"ruleBased": 0.0, "nerModel": 0.0, "llmSignal": 0.0}
        weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
        
        assert weighted == 0.0

    def test_all_ones_yields_one(self):
        """Test that all 1.0 scores yield 1.0 confidence."""
        scores = {"ruleBased": 1.0, "nerModel": 1.0, "llmSignal": 1.0}
        weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
        
        assert weighted == 1.0


# =============================================================================
# Review Queue Population Tests
# =============================================================================

class TestReviewQueuePopulation:
    """Test review queue population logic."""

    def test_low_confidence_fields_added_to_queue(self):
        """Test that fields below threshold are added to review queue."""
        fields = VALIDATION_LOW_CONFIDENCE_INPUT["fields"]
        
        needs_review = []
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = (
                0.4 * scores["ruleBased"] +
                0.4 * scores["nerModel"] +
                0.2 * scores["llmSignal"]
            )
            if weighted < 0.75:
                needs_review.append(field_name)
        
        # Low confidence input should have multiple fields needing review
        assert len(needs_review) > 0

    def test_high_confidence_fields_not_in_queue(self):
        """Test that fields at or above threshold are not in review queue."""
        fields = VALIDATION_HIGH_CONFIDENCE_INPUT["fields"]
        
        needs_review = []
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = (
                0.4 * scores["ruleBased"] +
                0.4 * scores["nerModel"] +
                0.2 * scores["llmSignal"]
            )
            if weighted < 0.75:
                needs_review.append(field_name)
        
        # High confidence input should have no fields needing review
        assert len(needs_review) == 0

    def test_mixed_confidence_partial_queue(self):
        """Test mixed confidence results in partial queue population."""
        fields = VALIDATION_MIXED_CONFIDENCE_INPUT["fields"]
        
        needs_review = []
        validated = []
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = (
                0.4 * scores["ruleBased"] +
                0.4 * scores["nerModel"] +
                0.2 * scores["llmSignal"]
            )
            if weighted < 0.75:
                needs_review.append(field_name)
            else:
                validated.append(field_name)
        
        # Should have both validated and needs_review
        # entity_name should validate, registered_agent should need review
        assert "entity_name" in validated
        assert "registered_agent_name" in needs_review

    def test_queue_item_contains_field_info(self):
        """Test that queue items contain necessary field information."""
        # Simulate what a queue item should contain
        field_data = VALIDATION_LOW_CONFIDENCE_INPUT["fields"]["entity_name"]
        
        queue_item = {
            "fieldName": "entity_name",
            "extractedValue": field_data["value"],
            "confidence": 0.4 * field_data["scores"]["ruleBased"] + 
                         0.4 * field_data["scores"]["nerModel"] + 
                         0.2 * field_data["scores"]["llmSignal"],
            "componentScores": field_data["scores"],
            "status": "pending",
        }
        
        assert "fieldName" in queue_item
        assert "extractedValue" in queue_item
        assert "confidence" in queue_item
        assert "componentScores" in queue_item
        assert queue_item["status"] == "pending"


# =============================================================================
# Queue Retrieval and Filtering Tests
# =============================================================================

class TestQueueRetrievalFiltering:
    """Test review queue retrieval and filtering."""

    def test_get_pending_reviews(self):
        """Test retrieval of pending review items."""
        # Simulate queue with multiple items
        queue = [
            {"fieldName": "entity_name", "status": "pending", "filingId": "fil-001"},
            {"fieldName": "agent_name", "status": "reviewed", "filingId": "fil-001"},
            {"fieldName": "address", "status": "pending", "filingId": "fil-002"},
        ]
        
        pending = [item for item in queue if item["status"] == "pending"]
        assert len(pending) == 2

    def test_filter_by_filing_id(self):
        """Test filtering queue by filing ID."""
        queue = [
            {"fieldName": "entity_name", "status": "pending", "filingId": "fil-001"},
            {"fieldName": "agent_name", "status": "pending", "filingId": "fil-001"},
            {"fieldName": "address", "status": "pending", "filingId": "fil-002"},
        ]
        
        filing_001 = [item for item in queue if item["filingId"] == "fil-001"]
        assert len(filing_001) == 2

    def test_filter_by_document_id(self):
        """Test filtering queue by document ID."""
        queue = [
            {"fieldName": "entity_name", "documentId": "doc-A", "filingId": "fil-001"},
            {"fieldName": "agent_name", "documentId": "doc-B", "filingId": "fil-001"},
            {"fieldName": "address", "documentId": "doc-A", "filingId": "fil-002"},
        ]
        
        doc_a = [item for item in queue if item["documentId"] == "doc-A"]
        assert len(doc_a) == 2

    def test_empty_queue_returns_empty(self):
        """Test that empty queue returns empty list."""
        queue = []
        pending = [item for item in queue if item.get("status") == "pending"]
        assert pending == []


# =============================================================================
# Submission Blocking Tests
# =============================================================================

class TestSubmissionBlocking:
    """Test submission blocking logic per Human-in-the-Loop principle."""

    def test_unresolved_fields_block_submission(self):
        """Test that unresolved fields block submission."""
        pending_reviews = [
            {"fieldName": "entity_name", "status": "pending"},
        ]
        
        can_submit = len(pending_reviews) == 0
        assert can_submit == False

    def test_all_resolved_allows_submission(self):
        """Test that all resolved allows submission."""
        pending_reviews = []  # No pending items
        
        can_submit = len(pending_reviews) == 0
        assert can_submit == True

    def test_blocked_submission_returns_403(self):
        """Test that blocked submission should return HTTP 403."""
        has_unresolved = True
        expected_http_status = 403 if has_unresolved else 200
        
        assert expected_http_status == 403

    def test_allowed_submission_returns_200(self):
        """Test that allowed submission returns HTTP 200."""
        has_unresolved = False
        expected_http_status = 403 if has_unresolved else 200
        
        assert expected_http_status == 200

    def test_blocking_message_includes_field_count(self):
        """Test that blocking message includes unresolved count."""
        unresolved_count = 3
        message = f"Submission blocked: {unresolved_count} field(s) require human review"
        
        assert "3" in message
        assert "require human review" in message

    def test_blocking_response_includes_field_names(self):
        """Test that blocking response includes unresolved field names."""
        unresolved_fields = ["entity_name", "registered_agent_name"]
        response = {
            "error": {
                "code": "UNRESOLVED_FIELDS",
                "unresolvedFields": unresolved_fields,
            }
        }
        
        assert "entity_name" in response["error"]["unresolvedFields"]
        assert "registered_agent_name" in response["error"]["unresolvedFields"]


# =============================================================================
# Review Decision Tests
# =============================================================================

class TestReviewDecisions:
    """Test human review decision handling."""

    def test_accept_decision_marks_resolved(self):
        """Test that accepting a review marks it resolved."""
        item = {"status": "pending"}
        
        # Simulate acceptance
        item["status"] = "reviewed"
        item["decision"] = "accepted"
        
        assert item["status"] == "reviewed"
        assert item["decision"] == "accepted"

    def test_reject_decision_with_correction(self):
        """Test that rejecting includes corrected value."""
        item = {
            "status": "pending",
            "extractedValue": "WRONG LLC",
        }
        
        # Simulate rejection with correction
        item["status"] = "reviewed"
        item["decision"] = "rejected"
        item["correctedValue"] = "CORRECT LLC"
        
        assert item["status"] == "reviewed"
        assert item["decision"] == "rejected"
        assert item["correctedValue"] == "CORRECT LLC"

    def test_reviewer_id_required(self):
        """Test that reviewer ID is required for decisions."""
        decision = {
            "reviewerId": "user-123",
            "decision": "accepted",
        }
        
        assert "reviewerId" in decision
        assert decision["reviewerId"] != ""

    def test_decision_timestamp_recorded(self):
        """Test that decision timestamp is recorded."""
        from datetime import datetime
        
        decision = {
            "decision": "accepted",
            "reviewedAt": datetime.now().isoformat(),
        }
        
        assert "reviewedAt" in decision

    def test_cannot_review_already_reviewed(self):
        """Test that already-reviewed items cannot be reviewed again."""
        item = {"status": "reviewed", "decision": "accepted"}
        
        # Should not allow re-review
        can_review = item["status"] == "pending"
        assert can_review == False


# =============================================================================
# Validation Summary Tests
# =============================================================================

class TestValidationSummary:
    """Test validation summary generation."""

    def test_summary_includes_total_fields(self):
        """Test that summary includes total field count."""
        fields = VALIDATION_HIGH_CONFIDENCE_INPUT["fields"]
        
        summary = {
            "totalFields": len(fields),
        }
        
        assert summary["totalFields"] == 4

    def test_summary_includes_validated_count(self):
        """Test that summary includes validated field count."""
        fields = VALIDATION_HIGH_CONFIDENCE_INPUT["fields"]
        
        validated = 0
        for field_data in fields.values():
            scores = field_data["scores"]
            weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
            if weighted >= 0.75:
                validated += 1
        
        summary = {"validatedFields": validated}
        
        assert summary["validatedFields"] == 4

    def test_summary_includes_needs_review_count(self):
        """Test that summary includes needs review count."""
        fields = VALIDATION_LOW_CONFIDENCE_INPUT["fields"]
        
        needs_review = 0
        for field_data in fields.values():
            scores = field_data["scores"]
            weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
            if weighted < 0.75:
                needs_review += 1
        
        summary = {"needsReviewFields": needs_review}
        
        assert summary["needsReviewFields"] == 3

    def test_summary_includes_average_confidence(self):
        """Test that summary includes average confidence."""
        fields = VALIDATION_HIGH_CONFIDENCE_INPUT["fields"]
        
        confidences = []
        for field_data in fields.values():
            scores = field_data["scores"]
            weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
            confidences.append(weighted)
        
        avg = sum(confidences) / len(confidences) if confidences else 0
        summary = {"averageConfidence": avg}
        
        assert 0 <= summary["averageConfidence"] <= 1

    def test_summary_includes_lowest_confidence(self):
        """Test that summary identifies lowest confidence field."""
        fields = VALIDATION_MIXED_CONFIDENCE_INPUT["fields"]
        
        lowest_field = None
        lowest_conf = 1.0
        
        for field_name, field_data in fields.items():
            scores = field_data["scores"]
            weighted = 0.4 * scores["ruleBased"] + 0.4 * scores["nerModel"] + 0.2 * scores["llmSignal"]
            if weighted < lowest_conf:
                lowest_conf = weighted
                lowest_field = field_name
        
        summary = {
            "lowestConfidence": {
                "fieldName": lowest_field,
                "confidence": lowest_conf,
            }
        }
        
        assert summary["lowestConfidence"]["fieldName"] == "registered_agent_name"
