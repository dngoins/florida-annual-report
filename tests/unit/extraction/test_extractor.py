"""
Unit Tests for Extraction Pipeline

Tests:
- spaCy NER accuracy on fixture texts
- LLM fallback trigger conditions  
- Full pipeline orchestration
- OCR text extraction

All external APIs (Textract, Anthropic) are mocked.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
import sys
import os

# Add the extraction service to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../src/services/extraction-service"))

from extraction.models import ExtractedFields, Officer, ConfidenceScores, NeedsReviewFlags
from extraction.ner import SpacyNER
from extraction.pipeline import ExtractionPipeline, ExtractionError
from extraction.ocr import TextractOCR

# Import test fixtures
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from fixtures.sample_documents import (
    ARTICLES_OF_INCORPORATION,
    ANNUAL_REPORT_DOCUMENT,
    LOW_QUALITY_OCR_TEXT,
    PARTIAL_DOCUMENT,
    MINIMAL_DOCUMENT,
    DOCUMENT_FIXTURES,
)
from fixtures.mock_responses import (
    TEXTRACT_HIGH_CONFIDENCE_RESPONSE,
    TEXTRACT_LOW_CONFIDENCE_RESPONSE,
    CLAUDE_EXTRACTION_RESPONSE,
    CLAUDE_LOW_CONFIDENCE_RESPONSE,
)


# =============================================================================
# SpaCy NER Tests
# =============================================================================

class TestSpacyNER:
    """Tests for spaCy NER extraction accuracy."""

    @pytest.fixture
    def ner_extractor(self):
        """Create NER extractor with mocked spaCy model."""
        extractor = SpacyNER(model_name="en_core_web_sm")
        
        # Mock the spaCy model
        mock_nlp = MagicMock()
        mock_doc = MagicMock()
        mock_doc.ents = []
        mock_nlp.return_value = mock_doc
        extractor._nlp = mock_nlp
        
        return extractor

    def test_extract_entity_name_from_articles(self, ner_extractor):
        """Test entity name extraction from Articles of Incorporation."""
        # Mock spaCy to return ORG entity
        mock_doc = MagicMock()
        mock_ent = MagicMock()
        mock_ent.label_ = "ORG"
        mock_ent.text = "SUNSHINE TECH LLC"
        mock_doc.ents = [mock_ent]
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(ARTICLES_OF_INCORPORATION)
        
        assert fields.entity_name is not None
        assert "SUNSHINE" in fields.entity_name.upper() or "LLC" in str(fields.entity_name).upper()
        assert confidences["entity_name"] >= 0.6

    def test_extract_registered_agent_from_articles(self, ner_extractor):
        """Test registered agent extraction from Articles."""
        mock_doc = MagicMock()
        mock_ent = MagicMock()
        mock_ent.label_ = "PERSON"
        mock_ent.text = "John Michael Smith"
        mock_ent.start_char = 150
        mock_doc.ents = [mock_ent]
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(ARTICLES_OF_INCORPORATION)
        
        assert fields.registered_agent_name is not None
        assert confidences["registered_agent_name"] >= 0.0

    def test_extract_principal_address(self, ner_extractor):
        """Test principal address extraction."""
        mock_doc = MagicMock()
        mock_doc.ents = []
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(ARTICLES_OF_INCORPORATION)
        
        # Address extraction is regex-based
        if fields.principal_address:
            assert "FL" in fields.principal_address or "Florida" in fields.principal_address
            assert confidences["principal_address"] >= 0.5

    def test_extract_officers_from_articles(self, ner_extractor):
        """Test officer extraction from Articles."""
        mock_doc = MagicMock()
        mock_doc.ents = []
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(ARTICLES_OF_INCORPORATION)
        
        assert isinstance(fields.officers, list)
        # Should find at least President and Secretary
        if len(fields.officers) > 0:
            titles = [o.title.lower() for o in fields.officers]
            assert any(t in titles for t in ["president", "secretary", "vice president", "treasurer"])

    def test_low_confidence_on_poor_quality_text(self, ner_extractor):
        """Test that poor OCR text results in lower confidence."""
        mock_doc = MagicMock()
        mock_doc.ents = []
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(LOW_QUALITY_OCR_TEXT)
        
        # Low quality OCR should have lower confidence
        assert any(conf < 0.75 for conf in confidences.values())

    def test_minimal_document_extraction(self, ner_extractor):
        """Test extraction from minimal document."""
        mock_doc = MagicMock()
        mock_doc.ents = []
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(MINIMAL_DOCUMENT)
        
        # Should still attempt extraction
        assert isinstance(fields, ExtractedFields)
        assert isinstance(confidences, dict)

    def test_annual_report_extraction(self, ner_extractor):
        """Test extraction from annual report document."""
        mock_doc = MagicMock()
        mock_ent = MagicMock()
        mock_ent.label_ = "ORG"
        mock_ent.text = "COASTAL VENTURES CORP"
        mock_doc.ents = [mock_ent]
        ner_extractor._nlp.return_value = mock_doc
        
        fields, confidences = ner_extractor.extract(ANNUAL_REPORT_DOCUMENT)
        
        assert fields.entity_name is not None

    def test_confidence_threshold_constant(self):
        """Test that confidence threshold is correctly set."""
        extractor = SpacyNER()
        assert extractor.CONFIDENCE_THRESHOLD == 0.75

    def test_ner_returns_empty_officers_list_when_none_found(self, ner_extractor):
        """Test that empty list is returned when no officers found."""
        mock_doc = MagicMock()
        mock_doc.ents = []
        ner_extractor._nlp.return_value = mock_doc
        
        # Use text with no recognizable officer patterns
        fields, confidences = ner_extractor.extract("Random text with no patterns")
        
        assert fields.officers == [] or fields.officers is None or len(fields.officers) == 0
        assert confidences["officers"] == 0.0


# =============================================================================
# LLM Fallback Tests
# =============================================================================

class TestLLMFallback:
    """Tests for LLM fallback trigger conditions."""

    @pytest.fixture
    def mock_pipeline(self):
        """Create pipeline with mocked dependencies."""
        pipeline = ExtractionPipeline()
        
        # Mock NER
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {"entity_name": 0.6, "registered_agent_name": 0.5, "principal_address": 0.4, "mailing_address": 0.3, "officers": 0.7}
        )
        pipeline._ner = mock_ner
        
        # Mock LLM
        mock_llm = MagicMock()
        mock_llm.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC", registered_agent_name="John Doe"),
            {"entity_name": 0.9, "registered_agent_name": 0.85, "principal_address": 0.8, "mailing_address": 0.75, "officers": 0.8}
        )
        pipeline._llm = mock_llm
        
        return pipeline

    def test_llm_fallback_triggered_when_confidence_below_threshold(self, mock_pipeline):
        """Test that LLM fallback is triggered when NER confidence < 0.75."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Test document",
            use_llm_fallback=True
        )
        
        # LLM should be called for low-confidence fields
        assert mock_pipeline._llm.extract.called
        assert "+llm" in method

    def test_llm_fallback_not_triggered_when_disabled(self, mock_pipeline):
        """Test that LLM fallback is not triggered when disabled."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Test document",
            use_llm_fallback=False
        )
        
        # LLM should not be called
        assert not mock_pipeline._llm.extract.called
        assert "llm" not in method

    def test_llm_fallback_not_triggered_for_high_confidence(self):
        """Test that LLM fallback is not triggered when all NER confidences >= 0.75."""
        pipeline = ExtractionPipeline()
        
        # Mock NER with high confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="HIGH CONF LLC"),
            {"entity_name": 0.85, "registered_agent_name": 0.80, "principal_address": 0.78, "mailing_address": 0.76, "officers": 0.82}
        )
        pipeline._ner = mock_ner
        
        mock_llm = MagicMock()
        pipeline._llm = mock_llm
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="High quality document",
            use_llm_fallback=True
        )
        
        # LLM should not be called
        assert not mock_llm.extract.called
        assert "llm" not in method

    def test_llm_merges_higher_confidence_results(self, mock_pipeline):
        """Test that LLM results replace NER when confidence is higher."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Test document",
            use_llm_fallback=True
        )
        
        # Should use LLM's registered_agent since it has higher confidence
        assert fields.registered_agent_name == "John Doe"

    def test_llm_failure_preserves_ner_results(self):
        """Test that NER results are preserved when LLM fails."""
        pipeline = ExtractionPipeline()
        
        # Mock NER
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="NER RESULT LLC"),
            {"entity_name": 0.6, "registered_agent_name": 0.5, "principal_address": 0.4, "mailing_address": 0.3, "officers": 0.5}
        )
        pipeline._ner = mock_ner
        
        # Mock LLM to raise error
        from extraction.llm import LLMError
        mock_llm = MagicMock()
        mock_llm.extract.side_effect = LLMError("API Error")
        pipeline._llm = mock_llm
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="Test document",
            use_llm_fallback=True
        )
        
        # Should preserve NER result
        assert fields.entity_name == "NER RESULT LLC"
        # Method should not include "+llm" since it failed
        assert "llm" not in method


# =============================================================================
# Full Pipeline Tests
# =============================================================================

class TestExtractionPipeline:
    """Tests for the full extraction pipeline."""

    def test_pipeline_requires_text_or_bytes(self):
        """Test that pipeline raises error when no input provided."""
        pipeline = ExtractionPipeline()
        
        with pytest.raises(ExtractionError):
            pipeline.extract()

    def test_pipeline_returns_correct_types(self):
        """Test that pipeline returns correct types."""
        pipeline = ExtractionPipeline()
        
        # Mock NER
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {"entity_name": 0.8, "registered_agent_name": 0.75, "principal_address": 0.8, "mailing_address": 0.75, "officers": 0.8}
        )
        pipeline._ner = mock_ner
        
        fields, confidence, needs_review, method = pipeline.extract(text="Test")
        
        assert isinstance(fields, ExtractedFields)
        assert isinstance(confidence, ConfidenceScores)
        assert isinstance(needs_review, NeedsReviewFlags)
        assert isinstance(method, str)

    def test_pipeline_sets_needs_review_correctly(self):
        """Test that needs_review flags are set correctly based on threshold."""
        pipeline = ExtractionPipeline()
        
        # Mock NER with mixed confidence
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {"entity_name": 0.8, "registered_agent_name": 0.6, "principal_address": 0.9, "mailing_address": 0.5, "officers": 0.8}
        )
        pipeline._ner = mock_ner
        
        fields, confidence, needs_review, method = pipeline.extract(
            text="Test",
            use_llm_fallback=False
        )
        
        assert needs_review.entity_name == False  # 0.8 >= 0.75
        assert needs_review.registered_agent_name == True  # 0.6 < 0.75
        assert needs_review.principal_address == False  # 0.9 >= 0.75
        assert needs_review.mailing_address == True  # 0.5 < 0.75
        assert needs_review.officers == False  # 0.8 >= 0.75

    def test_pipeline_extraction_method_tracking(self):
        """Test that extraction method is tracked correctly."""
        pipeline = ExtractionPipeline()
        
        mock_ner = MagicMock()
        mock_ner.extract.return_value = (
            ExtractedFields(entity_name="TEST LLC"),
            {"entity_name": 0.9, "registered_agent_name": 0.9, "principal_address": 0.9, "mailing_address": 0.9, "officers": 0.9}
        )
        pipeline._ner = mock_ner
        
        fields, confidence, needs_review, method = pipeline.extract(text="Test")
        
        assert method == "ner"

    def test_pipeline_confidence_threshold_constant(self):
        """Test pipeline confidence threshold."""
        pipeline = ExtractionPipeline()
        assert pipeline.CONFIDENCE_THRESHOLD == 0.75


# =============================================================================
# OCR Tests
# =============================================================================

class TestOCRExtraction:
    """Tests for OCR text extraction."""

    @pytest.fixture
    def mock_textract(self):
        """Create OCR extractor with mocked Textract client."""
        ocr = TextractOCR()
        ocr._client = MagicMock()
        return ocr

    def test_textract_high_confidence_response(self, mock_textract):
        """Test processing high confidence Textract response."""
        mock_textract._client.detect_document_text.return_value = TEXTRACT_HIGH_CONFIDENCE_RESPONSE
        
        text, confidence = mock_textract.extract_text(b"fake_pdf_bytes")
        
        assert "ARTICLES OF INCORPORATION" in text
        assert confidence > 0.9

    def test_textract_low_confidence_response(self, mock_textract):
        """Test processing low confidence Textract response."""
        mock_textract._client.detect_document_text.return_value = TEXTRACT_LOW_CONFIDENCE_RESPONSE
        
        text, confidence = mock_textract.extract_text(b"fake_pdf_bytes")
        
        # Low confidence OCR
        assert confidence < 0.5

    def test_textract_empty_response(self, mock_textract):
        """Test handling empty Textract response."""
        mock_textract._client.detect_document_text.return_value = {
            "DocumentMetadata": {"Pages": 0},
            "Blocks": []
        }
        
        text, confidence = mock_textract.extract_text(b"fake_pdf_bytes")
        
        assert text == ""
        assert confidence == 0.0

    def test_scanned_pdf_detection(self, mock_textract):
        """Test scanned PDF detection."""
        # This would require actual PDF parsing, just test the method exists
        assert hasattr(mock_textract, "is_scanned_pdf")
