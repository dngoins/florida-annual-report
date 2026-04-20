"""
Pydantic models for the Extraction Service.

Defines request/response schemas and data structures for the extraction pipeline.
"""

from typing import Optional
from pydantic import BaseModel, Field


class Officer(BaseModel):
    """Represents an officer/director extracted from a document."""
    
    name: str = Field(..., description="Officer's full name")
    title: str = Field(..., description="Officer's title (e.g., President, Director)")
    address: Optional[str] = Field(None, description="Officer's address")


class ExtractedFields(BaseModel):
    """Fields extracted from a document."""
    
    entity_name: Optional[str] = Field(None, description="Legal entity name")
    registered_agent_name: Optional[str] = Field(None, description="Registered agent's name")
    principal_address: Optional[str] = Field(None, description="Principal business address")
    mailing_address: Optional[str] = Field(None, description="Mailing address")
    officers: list[Officer] = Field(default_factory=list, description="List of officers/directors")


class ConfidenceScores(BaseModel):
    """Per-field confidence scores (0.0 to 1.0)."""
    
    entity_name: float = Field(0.0, ge=0.0, le=1.0)
    registered_agent_name: float = Field(0.0, ge=0.0, le=1.0)
    principal_address: float = Field(0.0, ge=0.0, le=1.0)
    mailing_address: float = Field(0.0, ge=0.0, le=1.0)
    officers: float = Field(0.0, ge=0.0, le=1.0)


class NeedsReviewFlags(BaseModel):
    """Flags indicating which fields need human review (confidence < 0.75)."""
    
    entity_name: bool = False
    registered_agent_name: bool = False
    principal_address: bool = False
    mailing_address: bool = False
    officers: bool = False


class ExtractionRequest(BaseModel):
    """Request to extract fields from a document."""
    
    document_id: str = Field(..., description="ID of the uploaded document")


class ExtractionResponse(BaseModel):
    """Response containing extracted fields and confidence scores."""
    
    status: str = Field("success", description="Status of the extraction")
    document_id: str = Field(..., description="ID of the processed document")
    fields: ExtractedFields = Field(..., description="Extracted field values")
    confidence: ConfidenceScores = Field(..., description="Per-field confidence scores")
    needs_review: NeedsReviewFlags = Field(..., description="Fields requiring human review")
    extraction_method: str = Field("ner", description="Primary method used: ocr, ner, or llm")
    error: Optional[str] = Field(None, description="Error message if extraction failed")


class HealthResponse(BaseModel):
    """Health check response."""
    
    status: str = "healthy"
    service: str = "extraction-service"
    version: str = "1.0.0"
