/**
 * Extract Route
 * 
 * Triggers extraction on an uploaded document.
 * POST /extract - Trigger OCR/NLP extraction pipeline
 * 
 * @module routes/extract
 */

const express = require('express');
const router = express.Router();

/**
 * POST /extract
 * 
 * Trigger extraction on an uploaded document.
 * 
 * Request: { document_id: string }
 * Response: { fields: {...}, confidence: {...} }
 */
router.post('/', async (req, res, next) => {
  try {
    const { document_id } = req.body;
    
    if (!document_id) {
      return res.error('document_id is required', 400);
    }
    
    // TODO: Integrate with Extraction Agent
    // TODO: Call OCR service (AWS Textract)
    // TODO: Run NLP pipeline (spaCy + LLM)
    
    // Placeholder response - will be implemented when Extraction Agent is ready
    res.success({
      document_id,
      fields: {
        entity_name: null,
        registered_agent_name: null,
        principal_address: null,
        officers: []
      },
      confidence: {
        entity_name: 0,
        registered_agent_name: 0,
        principal_address: 0,
        officers: 0
      },
      status: 'pending_implementation'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
