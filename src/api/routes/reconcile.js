/**
 * Reconcile Route
 * 
 * Scrapes and compares Sunbiz records against extracted data.
 * POST /reconcile - Compare extracted data with Sunbiz state
 * 
 * @module routes/reconcile
 */

const express = require('express');
const router = express.Router();

/**
 * POST /reconcile
 * 
 * Scrape and compare the current Sunbiz record against extracted data.
 * 
 * Request: { company_id: string }
 * Response: Structured diff showing fields that differ between extracted and Sunbiz state.
 */
router.post('/', async (req, res, next) => {
  try {
    const { company_id } = req.body;
    
    if (!company_id) {
      return res.error('company_id is required', 400);
    }
    
    // TODO: Integrate with Reconciliation Agent
    // TODO: Scrape current Sunbiz state using Playwright
    // TODO: Compare with extracted/stored data
    // TODO: Generate structured diff
    
    // Placeholder response - will be implemented when Reconciliation Agent is ready
    res.success({
      company_id,
      diff: {
        matched_fields: [],
        mismatched_fields: [],
        missing_fields: []
      },
      sunbiz_state: null,
      extracted_state: null,
      status: 'pending_implementation'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
