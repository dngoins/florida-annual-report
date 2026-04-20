"""
Unit tests for the Extraction Service.

Tests OCR, NER, LLM, and full pipeline with mocked external services.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch, Mock

import pytest

# Add service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../src/services/extraction-service"))

from extraction.models import (
    ExtractedFields,
    ConfidenceScores,
    NeedsReviewFlags,
    Officer,
    ExtractionRequest,
    ExtractionResponse,
)
from extraction.ocr import TextractOCR, OCRError
from extraction.ner import SpacyNER
from extraction.llm import ClaudeLLM, LLMError
from extraction.pipeline import ExtractionPipeline, ExtractionError


# Load test fixtures
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def load_fixture(filename: str) -> str:
    """Load a text fixture file."""
    with open(os.path.join(FIXTURES_DIR, filename), "r") as f:
        return f.read()


# =============================================================================
# Model Tests
# =============================================================================

class TestModels:
    """Test Pydantic models."""
    
    def test_officer_model(self):
        """Test Officer model creation."""
        officer = Officer(name="John Doe", title="President", address="123 Main St")
        assert officer.name == "John Doe"
        assert officer.title == "President"
        assert officer.address == "123 Main St"
    
    def test_extracted_fields_defaults(self):
        """Test ExtractedFields with default values."""
        fields = ExtractedFields()
        assert fields.entity_name is None
        assert fields.officers == []
    
    def test_confidence_scores_validation(self):
        """Test ConfidenceScores bounds."""
        scores = ConfidenceScores(entity_name=0.95)
        assert scores.entity_name == 0.95
        
        # Test bounds
        with pytest.raises(ValueError):
            ConfidenceScores(entity_name=1.5)
        
        with pytest.raises(ValueError):
            ConfidenceScores(entity_name=-0.1)
    
    def test_extraction_response_complete(self):
        """Test full ExtractionResponse model."""
        response = ExtractionResponse(
            document_id="test-123",
            fields=ExtractedFields(entity_name="Test Corp"),
            confidence=ConfidenceScores(entity_name=0.9),
            needs_review=NeedsReviewFlags(entity_name=False),
        )
        assert response.status == "success"
        assert response.document_id == "test-123"


# =============================================================================
# OCR Tests
# =============================================================================

class TestTextractOCR:
    """Test AWS Textract OCR module."""
    
    @patch("extraction.ocr.boto3")
    def test_extract_text_success(self, mock_boto3):
        """Test successful text extraction."""
        # Mock Textract response
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_client.detect_document_text.return_value = {
            "Blocks": [
                {"BlockType": "LINE", "Text": "ARTICLES OF INCORPORATION", "Confidence": 99.5},
                {"BlockType": "LINE", "Text": "Company Name: Test Corp LLC", "Confidence": 98.0},
                {"BlockType": "WORD", "Text": "ARTICLES", "Confidence": 99.5},  # Should be ignored
            ]
        }
        
        ocr = TextractOCR()
        text, confidence = ocr.extract_text(b"fake pdf bytes")
        
        assert "ARTICLES OF INCORPORATION" in text
        assert "Test Corp LLC" in text
        assert confidence > 0.97  # Average of 99.5 and 98.0
    
    @patch("extraction.ocr.boto3")
    def test_extract_text_api_error(self, mock_boto3):
        """Test handling of Textract API errors."""
        from botocore.exceptions import ClientError
        
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_client.detect_document_text.side_effect = ClientError(
            {"Error": {"Code": "InvalidParameterException", "Message": "Invalid document"}},
            "DetectDocumentText"
        )
        
        ocr = TextractOCR()
        with pytest.raises(OCRError) as exc_info:
            ocr.extract_text(b"bad pdf")
        
        assert "InvalidParameterException" in str(exc_info.value)
    
    @patch("extraction.ocr.boto3")
    def test_extract_from_s3(self, mock_boto3):
        """Test S3-based extraction."""
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_client.detect_document_text.return_value = {
            "Blocks": [
                {"BlockType": "LINE", "Text": "S3 Document Content", "Confidence": 95.0},
            ]
        }
        
        ocr = TextractOCR()
        text, confidence = ocr.extract_from_s3("my-bucket", "documents/test.pdf")
        
        assert "S3 Document Content" in text
        assert confidence == 0.95
        
        # Verify correct S3 params
        mock_client.detect_document_text.assert_called_with(
            Document={"S3Object": {"Bucket": "my-bucket", "Name": "documents/test.pdf"}}
        )


# =============================================================================
# NER Tests
# =============================================================================

class TestSpacyNER:
    """Test spaCy NER extraction module."""
    
    @pytest.fixture
    def sample_text(self):
        """Load sample articles text."""
        return load_fixture("sample_articles.txt")
    
    @pytest.fixture
    def ner(self):
        """Create NER instance with mocked spaCy."""
        ner = SpacyNER()
        # Mock the nlp property to avoid loading real model in tests
        mock_nlp = MagicMock()
        mock_doc = MagicMock()
        mock_doc.ents = []  # Empty entities, rely on regex patterns
        mock_nlp.return_value = mock_doc
        ner._nlp = mock_nlp
        return ner
    
    def test_extract_entity_name(self, ner, sample_text):
        """Test entity name extraction."""
        fields, confidences = ner.extract(sample_text)
        
        assert fields.entity_name is not None
        assert "SUNSHINE TECH SOLUTIONS LLC" in fields.entity_name.upper()
        assert confidences["entity_name"] >= 0.7
    
    def test_extract_registered_agent(self, ner, sample_text):
        """Test registered agent extraction."""
        fields, confidences = ner.extract(sample_text)
        
        assert fields.registered_agent_name is not None
        assert "John" in fields.registered_agent_name or "Smith" in fields.registered_agent_name
        assert confidences["registered_agent_name"] >= 0.7
    
    def test_extract_principal_address(self, ner, sample_text):
        """Test principal address extraction."""
        fields, confidences = ner.extract(sample_text)
        
        assert fields.principal_address is not None
        assert "Miami" in fields.principal_address or "33139" in fields.principal_address
    
    def test_extract_officers(self, ner, sample_text):
        """Test officer extraction."""
        fields, confidences = ner.extract(sample_text)
        
        assert len(fields.officers) >= 2
        
        # Check we found at least President and VP
        titles = [o.title.lower() for o in fields.officers]
        assert "president" in titles
    
    def test_empty_text(self, ner):
        """Test extraction from empty text."""
        fields, confidences = ner.extract("")
        
        assert fields.entity_name is None
        assert confidences["entity_name"] == 0.0


# =============================================================================
# LLM Tests
# =============================================================================

class TestClaudeLLM:
    """Test Claude LLM fallback module."""
    
    @patch("extraction.llm.anthropic.Anthropic")
    def test_extract_success(self, mock_anthropic_class):
        """Test successful LLM extraction."""
        # Mock Anthropic client and response
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client
        
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text=json.dumps({
            "entity_name": "LLM Extracted Corp",
            "registered_agent_name": "Jane Agent",
            "principal_address": "999 AI Lane, Miami, FL 33101",
            "officers": [
                {"name": "Bob President", "title": "President"},
            ]
        }))]
        mock_client.messages.create.return_value = mock_message
        
        llm = ClaudeLLM(api_key="test-key")
        fields, confidences = llm.extract("test document text")
        
        assert fields.entity_name == "LLM Extracted Corp"
        assert fields.registered_agent_name == "Jane Agent"
        assert len(fields.officers) == 1
        assert confidences["entity_name"] == 0.90  # LLM confidence boost
    
    @patch("extraction.llm.anthropic.Anthropic")
    def test_extract_json_in_markdown(self, mock_anthropic_class):
        """Test parsing JSON wrapped in markdown code block."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client
        
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text="""Here is the extracted data:
```json
{
    "entity_name": "Markdown Corp",
    "registered_agent_name": null,
    "principal_address": null,
    "officers": []
}
```
""")]
        mock_client.messages.create.return_value = mock_message
        
        llm = ClaudeLLM(api_key="test-key")
        fields, confidences = llm.extract("test")
        
        assert fields.entity_name == "Markdown Corp"
    
    def test_missing_api_key(self):
        """Test behavior when API key is missing."""
        with patch.dict(os.environ, {}, clear=True):
            llm = ClaudeLLM(api_key=None)
            
            with pytest.raises(LLMError) as exc_info:
                llm.extract("test text")
            
            assert "not initialized" in str(exc_info.value)


# =============================================================================
# Pipeline Tests
# =============================================================================

class TestExtractionPipeline:
    """Test full extraction pipeline."""
    
    @pytest.fixture
    def mock_pipeline(self):
        """Create pipeline with mocked components."""
        # Mock OCR
        mock_ocr = MagicMock(spec=TextractOCR)
        mock_ocr.is_scanned_pdf.return_value = False
        
        # Mock NER
        mock_ner = MagicMock(spec=SpacyNER)
        mock_ner.extract.return_value = (
            ExtractedFields(
                entity_name="Test Corp",
                registered_agent_name="Agent Name",
                principal_address="123 Main St, Miami, FL 33101",
                officers=[Officer(name="CEO Person", title="CEO")],
            ),
            {
                "entity_name": 0.85,
                "registered_agent_name": 0.80,
                "principal_address": 0.90,
                "mailing_address": 0.0,
                "officers": 0.70,  # Below threshold
            }
        )
        
        # Mock LLM
        mock_llm = MagicMock(spec=ClaudeLLM)
        mock_llm.extract.return_value = (
            ExtractedFields(
                officers=[
                    Officer(name="CEO Person", title="CEO"),
                    Officer(name="CFO Person", title="CFO"),
                ],
            ),
            {
                "entity_name": 0.0,
                "registered_agent_name": 0.0,
                "principal_address": 0.0,
                "mailing_address": 0.0,
                "officers": 0.90,
            }
        )
        
        return ExtractionPipeline(
            ocr_client=mock_ocr,
            ner_client=mock_ner,
            llm_client=mock_llm,
        )
    
    def test_extract_from_text(self, mock_pipeline):
        """Test extraction from pre-extracted text."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Sample document text",
            use_ocr=False,
            use_llm_fallback=True,
        )
        
        assert fields.entity_name == "Test Corp"
        assert confidence.entity_name == 0.85
        assert not needs_review.entity_name  # >= 0.75
        assert "ner" in method
    
    def test_llm_fallback_triggered(self, mock_pipeline):
        """Test that LLM fallback is triggered for low confidence fields."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Sample document text",
            use_ocr=False,
            use_llm_fallback=True,
        )
        
        # LLM should have been called for officers (confidence was 0.70)
        mock_pipeline.llm.extract.assert_called_once()
        
        # Officers confidence should now be 0.90 from LLM
        assert confidence.officers == 0.90
        assert "+llm" in method
    
    def test_no_llm_fallback_when_disabled(self, mock_pipeline):
        """Test that LLM fallback is skipped when disabled."""
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Sample document text",
            use_ocr=False,
            use_llm_fallback=False,
        )
        
        mock_pipeline.llm.extract.assert_not_called()
        assert "+llm" not in method
    
    def test_needs_review_flags(self, mock_pipeline):
        """Test that needs_review flags are set correctly."""
        # Modify mock to have low confidence
        mock_pipeline.ner.extract.return_value = (
            ExtractedFields(entity_name="Low Confidence Corp"),
            {
                "entity_name": 0.50,  # Below threshold
                "registered_agent_name": 0.60,  # Below threshold
                "principal_address": 0.80,  # Above threshold
                "mailing_address": 0.0,
                "officers": 0.40,  # Below threshold
            }
        )
        mock_pipeline.llm.extract.return_value = (
            ExtractedFields(),
            {"entity_name": 0.0, "registered_agent_name": 0.0, "principal_address": 0.0, "mailing_address": 0.0, "officers": 0.0}
        )
        
        fields, confidence, needs_review, method = mock_pipeline.extract(
            text="Test",
            use_llm_fallback=True,
        )
        
        assert needs_review.entity_name is True
        assert needs_review.registered_agent_name is True
        assert needs_review.principal_address is False  # 0.80 >= 0.75
        assert needs_review.officers is True
    
    def test_missing_input_raises_error(self, mock_pipeline):
        """Test that missing document_bytes and text raises error."""
        with pytest.raises(ExtractionError) as exc_info:
            mock_pipeline.extract()
        
        assert "must be provided" in str(exc_info.value)


# =============================================================================
# API Tests
# =============================================================================

class TestAPI:
    """Test FastAPI endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)
    
    def test_health_check(self, client):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "extraction-service"
    
    def test_upload_document(self, client):
        """Test document upload."""
        response = client.post(
            "/documents",
            files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "document_id" in data
    
    def test_upload_invalid_type(self, client):
        """Test upload with invalid file type."""
        response = client.post(
            "/documents",
            files={"file": ("test.exe", b"fake exe", "application/octet-stream")},
        )
        
        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["detail"]
    
    def test_extract_not_found(self, client):
        """Test extraction with non-existent document."""
        response = client.post(
            "/extract",
            json={"document_id": "non-existent-id"},
        )
        
        assert response.status_code == 404
    
    def test_get_document(self, client):
        """Test get document metadata."""
        # First upload
        upload_response = client.post(
            "/documents",
            files={"file": ("test.txt", b"test content", "text/plain")},
        )
        doc_id = upload_response.json()["document_id"]
        
        # Then get
        response = client.get(f"/documents/{doc_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["document"]["id"] == doc_id
        assert data["document"]["status"] == "uploaded"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
