/**
 * Documents Route
 * 
 * Handles document upload for processing.
 * POST /documents - Upload a document for extraction
 * 
 * @module routes/documents
 */

const express = require('express');
const router = express.Router();

/**
 * POST /documents
 * 
 * Upload a document for processing.
 * 
 * Request: multipart/form-data with file field
 * Response: { document_id: string, status: "processing" }
 */
router.post('/', async (req, res, next) => {
  try {
    // TODO: Implement file upload handling with multer
    // TODO: Integrate with Ingestion Agent
    // TODO: Store document in Azure Blob Storage
    
    // Placeholder response - will be implemented when Ingestion Agent is ready
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.success({
      document_id: documentId,
      status: 'processing'
    }, 202);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
