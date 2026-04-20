"""
Extraction Service Package

Provides OCR, NER, and LLM-based document extraction for Florida Annual Reports.
"""

from extraction.models import (
    ExtractionRequest,
    ExtractionResponse,
    ExtractedFields,
    ConfidenceScores,
    Officer,
)
from extraction.pipeline import ExtractionPipeline

__all__ = [
    "ExtractionRequest",
    "ExtractionResponse", 
    "ExtractedFields",
    "ConfidenceScores",
    "Officer",
    "ExtractionPipeline",
]
