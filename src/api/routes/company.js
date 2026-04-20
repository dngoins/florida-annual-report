/**
 * Company Route
 * 
 * Returns company records from the database.
 * GET /company/:id - Get full normalized company record
 * 
 * @module routes/company
 */

const express = require('express');
const router = express.Router();

/**
 * GET /company/:id
 * 
 * Returns the full normalized company record.
 * 
 * Response: Complete company object including officers, addresses, and filing history.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.error('Company ID is required', 400);
    }
    
    // TODO: Query AzureSQL database for company record
    // TODO: Include officers, addresses, filing history
    
    // Placeholder response - will be implemented when database is connected
    res.success({
      id,
      entity_name: null,
      document_number: null,
      fei_ein_number: null,
      date_filed: null,
      status: null,
      principal_address: null,
      mailing_address: null,
      registered_agent: null,
      officers: [],
      filing_history: [],
      message: 'Database integration pending'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
