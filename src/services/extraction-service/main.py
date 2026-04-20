"""
Florida Annual Report - Extraction Service

FastAPI application providing OCR, NER, and LLM-based document extraction.
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

# Add extraction module to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extraction.models import (
    ExtractionRequest,
    ExtractionResponse,
    ExtractedFields,
    ConfidenceScores,
    NeedsReviewFlags,
    HealthResponse,
)
from extraction.pipeline import ExtractionPipeline, ExtractionError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Document store (in production, use Azure Blob + CosmosDB)
document_store: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting Extraction Service...")
    yield
    logger.info("Shutting down Extraction Service...")


# FastAPI app
app = FastAPI(
    title="Florida Annual Report - Extraction Service",
    description="OCR, NER, and LLM-based document extraction for Florida Annual Reports",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize extraction pipeline
pipeline = ExtractionPipeline()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse()


@app.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    document_id: Optional[str] = Form(None),
):
    """
    Upload a document for processing.
    
    Accepts PDF, DOCX, CSV, or Markdown files.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Validate file type
    allowed_extensions = [".pdf", ".docx", ".csv", ".md", ".txt"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {allowed_extensions}",
        )
    
    # Generate document ID if not provided
    if not document_id:
        import uuid
        document_id = str(uuid.uuid4())
    
    # Read file content
    content = await file.read()
    
    # Store document (in production, upload to Azure Blob)
    document_store[document_id] = {
        "id": document_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "bytes": content,
        "uploaded_at": datetime.utcnow().isoformat(),
        "status": "uploaded",
    }
    
    logger.info(f"Document uploaded: {document_id} ({file.filename}, {len(content)} bytes)")
    
    return {
        "status": "success",
        "document_id": document_id,
        "filename": file.filename,
        "message": "Document uploaded. Call POST /extract to process.",
    }


@app.post("/extract", response_model=ExtractionResponse)
async def extract_document(request: ExtractionRequest):
    """
    Trigger extraction on an uploaded document.
    
    Runs the 3-stage pipeline:
    1. OCR (AWS Textract) for scanned PDFs
    2. NER (spaCy) for entity extraction
    3. LLM (Claude) fallback for low-confidence fields
    """
    document_id = request.document_id
    
    # Retrieve document
    if document_id not in document_store:
        raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
    
    doc = document_store[document_id]
    document_bytes = doc.get("bytes")
    
    if not document_bytes:
        raise HTTPException(status_code=400, detail="Document content not available")
    
    try:
        # Run extraction pipeline
        fields, confidence, needs_review, method = pipeline.extract(
            document_bytes=document_bytes,
            use_ocr=True,
            use_llm_fallback=True,
        )
        
        # Update document status
        doc["status"] = "extracted"
        doc["extracted_at"] = datetime.utcnow().isoformat()
        
        logger.info(f"Extraction complete for {document_id}: method={method}")
        
        return ExtractionResponse(
            status="success",
            document_id=document_id,
            fields=fields,
            confidence=confidence,
            needs_review=needs_review,
            extraction_method=method,
        )
        
    except ExtractionError as e:
        logger.error(f"Extraction failed for {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error extracting {document_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal extraction error")


@app.post("/extract/text", response_model=ExtractionResponse)
async def extract_from_text(
    document_id: str = Form(...),
    text: str = Form(...),
):
    """
    Extract fields from pre-provided text (skips OCR).
    
    Useful for testing or when text is already extracted.
    """
    try:
        fields, confidence, needs_review, method = pipeline.extract(
            text=text,
            use_ocr=False,
            use_llm_fallback=True,
        )
        
        return ExtractionResponse(
            status="success",
            document_id=document_id,
            fields=fields,
            confidence=confidence,
            needs_review=needs_review,
            extraction_method=method,
        )
        
    except ExtractionError as e:
        logger.error(f"Text extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents/{document_id}")
async def get_document(document_id: str):
    """Get document metadata and extraction status."""
    if document_id not in document_store:
        raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
    
    doc = document_store[document_id].copy()
    # Don't return raw bytes
    doc.pop("bytes", None)
    
    return {"status": "success", "document": doc}


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
