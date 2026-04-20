"""
Extraction Pipeline - Orchestrates OCR, NER, and LLM stages.

Implements the full extraction workflow per docs/reference/document-extraction.md
"""

import logging
from typing import Optional

from extraction.models import (
    ExtractedFields,
    ConfidenceScores,
    NeedsReviewFlags,
    Officer,
)
from extraction.ocr import TextractOCR, OCRError
from extraction.ner import SpacyNER, NERError
from extraction.llm import ClaudeLLM, LLMError

logger = logging.getLogger(__name__)


class ExtractionPipeline:
    """
    Three-stage extraction pipeline:
    
    1. OCR (AWS Textract) - for scanned PDFs
    2. NER (spaCy) - primary entity extraction
    3. LLM (Claude) - fallback for low-confidence fields
    """
    
    CONFIDENCE_THRESHOLD = 0.75
    
    def __init__(
        self,
        ocr_client: Optional[TextractOCR] = None,
        ner_client: Optional[SpacyNER] = None,
        llm_client: Optional[ClaudeLLM] = None,
    ):
        """
        Initialize the extraction pipeline.
        
        Args:
            ocr_client: TextractOCR instance (lazy-loaded if not provided)
            ner_client: SpacyNER instance (lazy-loaded if not provided)
            llm_client: ClaudeLLM instance (lazy-loaded if not provided)
        """
        self._ocr = ocr_client
        self._ner = ner_client
        self._llm = llm_client
    
    @property
    def ocr(self) -> TextractOCR:
        """Lazy-load OCR client."""
        if self._ocr is None:
            self._ocr = TextractOCR()
        return self._ocr
    
    @property
    def ner(self) -> SpacyNER:
        """Lazy-load NER client."""
        if self._ner is None:
            self._ner = SpacyNER()
        return self._ner
    
    @property
    def llm(self) -> ClaudeLLM:
        """Lazy-load LLM client."""
        if self._llm is None:
            self._llm = ClaudeLLM()
        return self._llm
    
    def extract(
        self,
        document_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
        use_ocr: bool = True,
        use_llm_fallback: bool = True,
    ) -> tuple[ExtractedFields, ConfidenceScores, NeedsReviewFlags, str]:
        """
        Run the full extraction pipeline.
        
        Args:
            document_bytes: Raw document bytes (PDF)
            text: Pre-extracted text (skips OCR if provided)
            use_ocr: Whether to run OCR on scanned PDFs
            use_llm_fallback: Whether to use LLM for low-confidence fields
            
        Returns:
            Tuple of (fields, confidence, needs_review, extraction_method)
        """
        extraction_method = "ner"
        
        # Stage 1: OCR (if needed)
        if text is None and document_bytes is not None:
            text, ocr_confidence = self._run_ocr(document_bytes, use_ocr)
            if ocr_confidence > 0:
                extraction_method = "ocr+ner"
        elif text is None:
            raise ExtractionError("Either document_bytes or text must be provided")
        
        # Stage 2: NER extraction
        fields, confidences = self._run_ner(text)
        
        # Stage 3: LLM fallback for low-confidence fields
        if use_llm_fallback:
            fields, confidences, used_llm = self._run_llm_fallback(text, fields, confidences)
            if used_llm:
                extraction_method += "+llm"
        
        # Build confidence scores model
        confidence_scores = ConfidenceScores(
            entity_name=confidences.get("entity_name", 0.0),
            registered_agent_name=confidences.get("registered_agent_name", 0.0),
            principal_address=confidences.get("principal_address", 0.0),
            mailing_address=confidences.get("mailing_address", 0.0),
            officers=confidences.get("officers", 0.0),
        )
        
        # Determine which fields need review
        needs_review = NeedsReviewFlags(
            entity_name=confidence_scores.entity_name < self.CONFIDENCE_THRESHOLD,
            registered_agent_name=confidence_scores.registered_agent_name < self.CONFIDENCE_THRESHOLD,
            principal_address=confidence_scores.principal_address < self.CONFIDENCE_THRESHOLD,
            mailing_address=confidence_scores.mailing_address < self.CONFIDENCE_THRESHOLD,
            officers=confidence_scores.officers < self.CONFIDENCE_THRESHOLD,
        )
        
        logger.info(
            f"Extraction complete: method={extraction_method}, "
            f"needs_review={self._count_needs_review(needs_review)} fields"
        )
        
        return fields, confidence_scores, needs_review, extraction_method
    
    def _run_ocr(self, document_bytes: bytes, use_ocr: bool) -> tuple[str, float]:
        """Run OCR stage if document is scanned."""
        if not use_ocr:
            return "", 0.0
        
        try:
            # Check if PDF is scanned
            if self.ocr.is_scanned_pdf(document_bytes):
                logger.info("Detected scanned PDF, running OCR...")
                text, confidence = self.ocr.extract_text(document_bytes)
                return text, confidence
            else:
                # Native PDF - extract text directly
                from pypdf import PdfReader
                import io
                
                reader = PdfReader(io.BytesIO(document_bytes))
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                return text, 0.95  # High confidence for native PDF text
                
        except OCRError as e:
            logger.error(f"OCR failed: {e}")
            raise ExtractionError(f"OCR stage failed: {e}") from e
        except Exception as e:
            logger.error(f"Document processing failed: {e}")
            raise ExtractionError(f"Document processing failed: {e}") from e
    
    def _run_ner(self, text: str) -> tuple[ExtractedFields, dict[str, float]]:
        """Run NER extraction stage."""
        try:
            return self.ner.extract(text)
        except NERError as e:
            logger.error(f"NER failed: {e}")
            # Return empty results, LLM fallback may recover
            return ExtractedFields(), {
                "entity_name": 0.0,
                "registered_agent_name": 0.0,
                "principal_address": 0.0,
                "mailing_address": 0.0,
                "officers": 0.0,
            }
    
    def _run_llm_fallback(
        self,
        text: str,
        fields: ExtractedFields,
        confidences: dict[str, float],
    ) -> tuple[ExtractedFields, dict[str, float], bool]:
        """Run LLM fallback for low-confidence fields."""
        low_confidence_fields = [
            field for field, conf in confidences.items()
            if conf < self.CONFIDENCE_THRESHOLD
        ]
        
        if not low_confidence_fields:
            return fields, confidences, False
        
        logger.info(f"Running LLM fallback for fields: {low_confidence_fields}")
        
        try:
            llm_fields, llm_confidences = self.llm.extract(text, low_confidence_fields)
            
            # Merge LLM results into existing fields
            fields, confidences = self._merge_llm_results(
                fields, confidences,
                llm_fields, llm_confidences,
                low_confidence_fields,
            )
            
            return fields, confidences, True
            
        except LLMError as e:
            logger.warning(f"LLM fallback failed: {e}")
            # Keep original NER results
            return fields, confidences, False
    
    def _merge_llm_results(
        self,
        ner_fields: ExtractedFields,
        ner_confidences: dict[str, float],
        llm_fields: ExtractedFields,
        llm_confidences: dict[str, float],
        fields_to_merge: list[str],
    ) -> tuple[ExtractedFields, dict[str, float]]:
        """Merge LLM results into NER results for specified fields."""
        merged_fields = ner_fields.model_copy()
        merged_confidences = ner_confidences.copy()
        
        for field_name in fields_to_merge:
            llm_value = getattr(llm_fields, field_name, None)
            llm_conf = llm_confidences.get(field_name, 0.0)
            
            # Use LLM result if it has higher confidence
            if llm_conf > ner_confidences.get(field_name, 0.0):
                if llm_value is not None:
                    setattr(merged_fields, field_name, llm_value)
                    merged_confidences[field_name] = llm_conf
        
        return merged_fields, merged_confidences
    
    def _count_needs_review(self, needs_review: NeedsReviewFlags) -> int:
        """Count how many fields need human review."""
        count = 0
        if needs_review.entity_name:
            count += 1
        if needs_review.registered_agent_name:
            count += 1
        if needs_review.principal_address:
            count += 1
        if needs_review.mailing_address:
            count += 1
        if needs_review.officers:
            count += 1
        return count


class ExtractionError(Exception):
    """Custom exception for pipeline extraction failures."""
    pass
