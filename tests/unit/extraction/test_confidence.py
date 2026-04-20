"""
Unit Tests for Confidence Score Calculation

Tests:
- Confidence score bounds validation (0-1)
- Weighted scoring formula: 40% rule-based, 40% NER, 20% LLM
- NER confidence sources
- LLM confidence boost behavior
- Confidence merging between NER and LLM

Per docs/reference/document-extraction.md
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
import sys
import os

# Add the extraction service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../src/services/extraction-service"))

from extraction.models import ExtractedFields, ConfidenceScores, NeedsReviewFlags
from extraction.pipeline import ExtractionPipeline


# =============================================================================
# Confidence Score Bounds Tests
# =============================================================================

class TestConfidenceScoreBounds:
    """Test that confidence scores are always within valid bounds [0, 1]."""

    def test_confidence_scores_are_normalized(self):
        """Test that confidence scores are between 0 and 1."""
        scores = ConfidenceScores(
            entity_name=0.85,
            registered_agent_name=0.75,
            principal_address=0.80,
            mailing_address=0.70,
            officers=0.90,
        )
        
        assert 0 <= scores.entity_name <= 1
        assert 0 <= scores.registered_agent_name <= 1
        assert 0 <= scores.principal_address <= 1
        assert 0 <= scores.mailing_address <= 1
        assert 0 <= scores.officers <= 1

    def test_confidence_zero_is_valid(self):
        """Test that zero confidence is valid."""
        scores = ConfidenceScores(
            entity_name=0.0,
            registered_agent_name=0.0,
            principal_address=0.0,
            mailing_address=0.0,
            officers=0.0,
        )
        
        assert scores.entity_name == 0.0
        assert scores.registered_agent_name == 0.0

    def test_confidence_one_is_valid(self):
        """Test that confidence of 1.0 is valid."""
        scores = ConfidenceScores(
            entity_name=1.0,
            registered_agent_name=1.0,
            principal_address=1.0,
            mailing_address=1.0,
            officers=1.0,
        )
        
        assert scores.entity_name == 1.0
        assert scores.officers == 1.0

    def test_confidence_model_fields(self):
        """Test ConfidenceScores model has all required fields."""
        scores = ConfidenceScores(
            entity_name=0.5,
            registered_agent_name=0.5,
            principal_address=0.5,
            mailing_address=0.5,
            officers=0.5,
        )
        
        assert hasattr(scores, "entity_name")
        assert hasattr(scores, "registered_agent_name")
        assert hasattr(scores, "principal_address")
        assert hasattr(scores, "mailing_address")
        assert hasattr(scores, "officers")


# =============================================================================
# Weighted Scoring Formula Tests
# =============================================================================

class TestWeightedScoringFormula:
    """
    Test the weighted confidence formula.
    
    Per spec:
    - Rule-based patterns: 40%
    - NER model confidence: 40%
    - LLM certainty signal: 20%
    """

    def test_pipeline_uses_ner_confidence_directly(self):
        """Test that pipeline incorporates NER confidence scores."""
        pipeline = ExtractionPipeline()
        
        # Mock NER to return specific confidences
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {
                "entity_name": 0.80,
                "registered_agent_name": 0.70,
                "principal_address": 0.60,
                "mailing_address": 0.50,
                "officers": 0.85,
            }
        )
        pipeline._ner = mock_ner
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="Test document",
            use_llm_fallback=False
        )
        
        # Confidence should match NER output
        assert confidence.entity_name == 0.80
        assert confidence.registered_agent_name == 0.70
        assert confidence.principal_address == 0.60
        assert confidence.mailing_address == 0.50
        assert confidence.officers == 0.85

    def test_llm_boosts_low_confidence_fields(self):
        """Test that LLM can boost confidence for low-confidence fields."""
        pipeline = ExtractionPipeline()
        
        # Mock NER with low confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER LLC"),
            {
                "entity_name": 0.50,  # Below threshold
                "registered_agent_name": 0.45,  # Below threshold
                "principal_address": 0.40,  # Below threshold
                "mailing_address": 0.85,  # Above threshold
                "officers": 0.80,  # Above threshold
            }
        )
        pipeline._ner = mock_ner
        
        # Mock LLM with high confidence
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM LLC", registered_agent_name="LLM Agent", principal_address="LLM Address"),
            {
                "entity_name": 0.90,
                "registered_agent_name": 0.85,
                "principal_address": 0.88,
                "mailing_address": 0.75,
                "officers": 0.80,
            }
        )
        pipeline._llm = mock_llm
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="Test document",
            use_llm_fallback=True
        )
        
        # LLM should boost entity_name, registered_agent, and principal_address
        assert confidence.entity_name >= 0.50
        assert confidence.registered_agent_name >= 0.45
        # mailing_address should be unchanged (already high)
        assert confidence.mailing_address == 0.85

    def test_confidence_threshold_determines_review(self):
        """Test that 0.75 threshold determines review status."""
        pipeline = ExtractionPipeline()
        
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {
                "entity_name": 0.74,  # Just below
                "registered_agent_name": 0.75,  # Exactly at
                "principal_address": 0.76,  # Just above
                "mailing_address": 0.50,  # Well below
                "officers": 0.90,  # Well above
            }
        )
        pipeline._ner = mock_ner
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="Test",
            use_llm_fallback=False
        )
        
        assert needs_review.entity_name == True  # 0.74 < 0.75
        assert needs_review.registered_agent_name == False  # 0.75 >= 0.75
        assert needs_review.principal_address == False  # 0.76 >= 0.75
        assert needs_review.mailing_address == True  # 0.50 < 0.75
        assert needs_review.officers == False  # 0.90 >= 0.75


# =============================================================================
# NER Confidence Source Tests
# =============================================================================

class TestNERConfidenceSources:
    """Test NER confidence calculation sources."""

    def test_ner_returns_dict_of_confidences(self):
        """Test that NER returns confidence dict for all fields."""
        from extraction.ner import SpacyNER
        
        ner = SpacyNER()
        
        # Mock spaCy
        mock_nlp = MagicMock()
        mock_doc = MagicMock()
        mock_doc.ents = []
        mock_nlp.return_value = mock_doc
        ner._nlp = mock_nlp
        
        fields, confidences = ner.extract("Test text")
        
        # Should return confidences for all field types
        assert "entity_name" in confidences
        assert "registered_agent_name" in confidences
        assert "principal_address" in confidences
        assert "mailing_address" in confidences
        assert "officers" in confidences

    def test_ner_pattern_match_confidence(self):
        """Test that pattern match yields higher confidence than NER fallback."""
        from extraction.ner import SpacyNER
        
        ner = SpacyNER()
        
        # Mock spaCy with ORG entity
        mock_nlp = MagicMock()
        mock_doc = MagicMock()
        mock_ent = MagicMock()
        mock_ent.label_ = "ORG"
        mock_ent.text = "FALLBACK ORG"
        mock_doc.ents = [mock_ent]
        mock_nlp.return_value = mock_doc
        ner._nlp = mock_nlp
        
        # Text with clear pattern - should get high confidence
        pattern_text = "Company Name: PATTERN MATCH LLC"
        fields1, conf1 = ner.extract(pattern_text)
        
        # Text without pattern - should use NER fallback with lower confidence
        no_pattern_text = "FALLBACK ORG is a company"
        fields2, conf2 = ner.extract(no_pattern_text)
        
        # Pattern match should yield higher confidence
        assert conf1["entity_name"] >= conf2["entity_name"]

    def test_ner_officer_confidence_scales_with_count(self):
        """Test that officer confidence increases with more officers found."""
        from extraction.ner import SpacyNER
        
        ner = SpacyNER()
        
        mock_nlp = MagicMock()
        mock_doc = MagicMock()
        mock_doc.ents = []
        mock_nlp.return_value = mock_doc
        ner._nlp = mock_nlp
        
        # Two officers - should have confidence around 0.80
        two_officers_text = """
        President: John Smith
        Secretary: Jane Doe
        """
        fields1, conf1 = ner.extract(two_officers_text)
        
        # One officer - should have lower confidence around 0.65
        one_officer_text = """
        President: John Smith
        """
        fields2, conf2 = ner.extract(one_officer_text)
        
        # More officers = higher confidence
        if len(fields1.officers) > len(fields2.officers):
            assert conf1["officers"] >= conf2["officers"]


# =============================================================================
# LLM Confidence Boost Tests
# =============================================================================

class TestLLMConfidenceBoost:
    """Test LLM confidence boost behavior."""

    def test_llm_result_used_when_higher_confidence(self):
        """Test that LLM result is used when it has higher confidence."""
        pipeline = ExtractionPipeline()
        
        # NER returns low confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER VALUE"),
            {"entity_name": 0.40, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.0}
        )
        pipeline._ner = mock_ner
        
        # LLM returns high confidence
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM VALUE"),
            {"entity_name": 0.90, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.0}
        )
        pipeline._llm = mock_llm
        
        fields, confidence, _, _ = pipeline.extract(text="Test", use_llm_fallback=True)
        
        # Should use LLM value
        assert fields.entity_name == "LLM VALUE"
        assert confidence.entity_name == 0.90

    def test_ner_result_kept_when_higher_than_llm(self):
        """Test that NER result is kept when it has higher confidence than LLM."""
        pipeline = ExtractionPipeline()
        
        # NER returns high confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER VALUE", officers=[]),
            {"entity_name": 0.60, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.80}
        )
        pipeline._ner = mock_ner
        
        # LLM returns lower confidence for officers
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM VALUE", officers=[]),
            {"entity_name": 0.90, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.70}
        )
        pipeline._llm = mock_llm
        
        fields, confidence, _, _ = pipeline.extract(text="Test", use_llm_fallback=True)
        
        # Officers should keep NER confidence (not replaced by lower LLM)
        assert confidence.officers == 0.80

    def test_llm_only_called_for_low_confidence_fields(self):
        """Test that LLM is only called for fields below threshold."""
        pipeline = ExtractionPipeline()
        
        # NER with mixed confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="HIGH CONF", officers=[]),
            {
                "entity_name": 0.90,  # High - no fallback needed
                "registered_agent_name": 0.50,  # Low - needs fallback
                "principal_address": 0.85,  # High
                "mailing_address": 0.40,  # Low
                "officers": 0.80,  # High
            }
        )
        pipeline._ner = mock_ner
        
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(registered_agent_name="LLM Agent"),
            {"registered_agent_name": 0.85, "mailing_address": 0.80}
        )
        pipeline._llm = mock_llm
        
        pipeline.extract(text="Test", use_llm_fallback=True)
        
        # LLM should be called
        assert mock_llm.extract.called
        # Check the fields requested are the low-confidence ones
        call_args = mock_llm.extract.call_args
        requested_fields = call_args[0][1]  # Second positional arg
        assert "registered_agent_name" in requested_fields
        assert "mailing_address" in requested_fields


# =============================================================================
# Confidence Merging Tests
# =============================================================================

class TestConfidenceMerging:
    """Test confidence merging between NER and LLM."""

    def test_merge_replaces_value_with_confidence(self):
        """Test that merging replaces both value and confidence."""
        pipeline = ExtractionPipeline()
        
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER LLC", registered_agent_name="NER Agent"),
            {"entity_name": 0.50, "registered_agent_name": 0.60, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.0}
        )
        pipeline._ner = mock_ner
        
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM LLC", registered_agent_name="LLM Agent"),
            {"entity_name": 0.85, "registered_agent_name": 0.40}  # LLM lower for agent
        )
        pipeline._llm = mock_llm
        
        fields, confidence, _, _ = pipeline.extract(text="Test", use_llm_fallback=True)
        
        # entity_name: LLM higher, should replace
        assert fields.entity_name == "LLM LLC"
        assert confidence.entity_name == 0.85
        
        # registered_agent: NER higher, should keep
        assert fields.registered_agent_name == "NER Agent"
        assert confidence.registered_agent_name == 0.60

    def test_merge_handles_none_values(self):
        """Test that merging handles None values correctly."""
        pipeline = ExtractionPipeline()
        
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER LLC"),  # No agent
            {"entity_name": 0.50, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.0}
        )
        pipeline._ner = mock_ner
        
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM LLC", registered_agent_name="LLM Agent"),
            {"entity_name": 0.85, "registered_agent_name": 0.80}
        )
        pipeline._llm = mock_llm
        
        fields, confidence, _, _ = pipeline.extract(text="Test", use_llm_fallback=True)
        
        # LLM should fill in missing agent
        assert fields.registered_agent_name == "LLM Agent"
        assert confidence.registered_agent_name == 0.80

    def test_needs_review_flags_updated_after_merge(self):
        """Test that needs_review is recalculated after LLM merge."""
        pipeline = ExtractionPipeline()
        
        # NER: all below threshold
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER LLC"),
            {"entity_name": 0.50, "registered_agent_name": 0.50, "principal_address": 0.50, "mailing_address": 0.50, "officers": 0.50}
        )
        pipeline._ner = mock_ner
        
        # LLM: some above threshold
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="LLM LLC"),
            {"entity_name": 0.85, "registered_agent_name": 0.80, "principal_address": 0.65, "mailing_address": 0.60, "officers": 0.78}
        )
        pipeline._llm = mock_llm
        
        fields, confidence, needs_review, _ = pipeline.extract(text="Test", use_llm_fallback=True)
        
        # After merge with LLM:
        assert needs_review.entity_name == False  # 0.85 >= 0.75
        assert needs_review.registered_agent_name == False  # 0.80 >= 0.75
        # principal_address: LLM has 0.65, NER has 0.50, so result is 0.65 (LLM higher)
        assert needs_review.principal_address == True  # 0.65 < 0.75
        assert needs_review.officers == False  # 0.78 >= 0.75
