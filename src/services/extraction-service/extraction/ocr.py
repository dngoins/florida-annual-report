"""
OCR Module - Azure AI Document Intelligence Integration

Stage 1 of the extraction pipeline: converts scanned PDFs to text using
Azure AI Document Intelligence (formerly Form Recognizer).
"""

import io
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class OCRError(Exception):
    """Custom exception for OCR failures."""
    pass


class AzureDocumentIntelligenceOCR:
    """
    Azure AI Document Intelligence OCR client.

    Uses the `prebuilt-read` model to extract printed and handwritten text
    from scanned PDFs and images.
    """

    CONFIDENCE_THRESHOLD = 0.75

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        Initialize the Document Intelligence client.

        Args:
            endpoint: Azure Document Intelligence endpoint
                     (defaults to AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT env var)
            api_key: API key (defaults to AZURE_DOCUMENT_INTELLIGENCE_KEY env var)
        """
        self.endpoint = endpoint or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
        self.api_key = api_key or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
        self._client = None

    @property
    def client(self):
        """Lazy-load the Azure SDK client so the module imports without credentials."""
        if self._client is None:
            if not self.endpoint or not self.api_key:
                raise OCRError(
                    "Azure Document Intelligence not configured: set "
                    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and "
                    "AZURE_DOCUMENT_INTELLIGENCE_KEY environment variables."
                )
            try:
                from azure.ai.documentintelligence import DocumentIntelligenceClient
                from azure.core.credentials import AzureKeyCredential
            except ImportError as exc:
                raise OCRError(
                    "azure-ai-documentintelligence package is not installed."
                ) from exc

            self._client = DocumentIntelligenceClient(
                endpoint=self.endpoint,
                credential=AzureKeyCredential(self.api_key),
            )
        return self._client

    @client.setter
    def client(self, value):
        """Allow tests to inject a mock client."""
        self._client = value

    def is_scanned_pdf(self, document_bytes: bytes) -> bool:
        """
        Detect if a PDF is scanned (image-based) vs native text.

        Args:
            document_bytes: Raw PDF bytes

        Returns:
            True if the PDF appears to be scanned/image-based
        """
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(document_bytes))
            text_content = ""
            for page in reader.pages[:3]:  # Check first 3 pages
                text_content += page.extract_text() or ""

            # If very little text found, likely scanned
            return len(text_content.strip()) < 100
        except Exception as e:
            logger.warning(f"Error checking PDF type: {e}")
            return True  # Default to OCR if uncertain

    def extract_text(self, document_bytes: bytes) -> tuple[str, float]:
        """
        Extract text from a document using Azure Document Intelligence.

        Args:
            document_bytes: Raw document bytes (PDF or image)

        Returns:
            Tuple of (extracted_text, average_confidence)
        """
        try:
            try:
                from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
            except ImportError as exc:
                raise OCRError(
                    "azure-ai-documentintelligence package is not installed."
                ) from exc

            poller = self.client.begin_analyze_document(
                "prebuilt-read",
                AnalyzeDocumentRequest(bytes_source=document_bytes),
            )
            result = poller.result()

            text = result.content or ""

            # Average per-word confidence across all pages, when available.
            confidences = []
            for page in getattr(result, "pages", None) or []:
                for word in getattr(page, "words", None) or []:
                    conf = getattr(word, "confidence", None)
                    if conf is not None:
                        confidences.append(conf)

            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

            logger.info(
                f"Document Intelligence extracted {len(text)} chars across "
                f"{len(getattr(result, 'pages', None) or [])} pages "
                f"with avg confidence {avg_confidence:.2f}"
            )

            return text, avg_confidence

        except OCRError:
            raise
        except Exception as e:
            # Catch Azure SDK errors and any unexpected failures.
            error_name = type(e).__name__
            logger.error(f"Document Intelligence error: {error_name} - {e}")
            raise OCRError(f"Azure Document Intelligence failed: {error_name}: {e}") from e


# Backward-compatible alias: existing code (pipeline, tests) imports `TextractOCR`.
# This indirection keeps the public name stable while the implementation is on Azure.
TextractOCR = AzureDocumentIntelligenceOCR
