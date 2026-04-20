"""
OCR Module - AWS Textract Integration

Stage 1 of the extraction pipeline: converts scanned PDFs to text using AWS Textract.
"""

import os
import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class TextractOCR:
    """
    AWS Textract OCR client for extracting text from scanned PDFs.
    
    Uses boto3 to call Textract's detect_document_text API.
    """
    
    CONFIDENCE_THRESHOLD = 0.75
    
    def __init__(
        self,
        aws_region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
    ):
        """
        Initialize Textract client.
        
        Args:
            aws_region: AWS region (defaults to AWS_REGION env var)
            aws_access_key_id: AWS access key (defaults to env var)
            aws_secret_access_key: AWS secret key (defaults to env var)
        """
        self.region = aws_region or os.getenv("AWS_REGION", "us-east-1")
        
        # Create boto3 client
        self.client = boto3.client(
            "textract",
            region_name=self.region,
            aws_access_key_id=aws_access_key_id or os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=aws_secret_access_key or os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
    
    def is_scanned_pdf(self, document_bytes: bytes) -> bool:
        """
        Detect if a PDF is scanned (image-based) vs native text.
        
        Args:
            document_bytes: Raw PDF bytes
            
        Returns:
            True if the PDF appears to be scanned/image-based
        """
        # Simple heuristic: check if PDF has extractable text
        # In production, use pypdf to check for text content
        try:
            from pypdf import PdfReader
            import io
            
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
        Extract text from a document using AWS Textract.
        
        Args:
            document_bytes: Raw document bytes (PDF or image)
            
        Returns:
            Tuple of (extracted_text, average_confidence)
        """
        try:
            response = self.client.detect_document_text(
                Document={"Bytes": document_bytes}
            )
            
            lines = []
            confidences = []
            
            for block in response.get("Blocks", []):
                if block["BlockType"] == "LINE":
                    lines.append(block.get("Text", ""))
                    confidences.append(block.get("Confidence", 0) / 100.0)
            
            text = "\n".join(lines)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            logger.info(
                f"Textract extracted {len(lines)} lines with avg confidence {avg_confidence:.2f}"
            )
            
            return text, avg_confidence
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            logger.error(f"Textract API error: {error_code} - {e}")
            raise OCRError(f"AWS Textract failed: {error_code}") from e
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise OCRError(f"OCR extraction failed: {e}") from e
    
    def extract_from_s3(self, bucket: str, key: str) -> tuple[str, float]:
        """
        Extract text from a document stored in S3.
        
        Args:
            bucket: S3 bucket name
            key: S3 object key
            
        Returns:
            Tuple of (extracted_text, average_confidence)
        """
        try:
            response = self.client.detect_document_text(
                Document={
                    "S3Object": {
                        "Bucket": bucket,
                        "Name": key,
                    }
                }
            )
            
            lines = []
            confidences = []
            
            for block in response.get("Blocks", []):
                if block["BlockType"] == "LINE":
                    lines.append(block.get("Text", ""))
                    confidences.append(block.get("Confidence", 0) / 100.0)
            
            text = "\n".join(lines)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            return text, avg_confidence
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            logger.error(f"Textract S3 API error: {error_code} - {e}")
            raise OCRError(f"AWS Textract S3 failed: {error_code}") from e


class OCRError(Exception):
    """Custom exception for OCR failures."""
    pass
