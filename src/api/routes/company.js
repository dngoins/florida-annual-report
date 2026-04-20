/**
 * Company Route
 * 
 * Returns company records from the database.
 * GET /company/:id - Get full normalized company record
 * 
 * Includes deadline_warning flag when < 30 days remain before May 1.
 * 
 * @module routes/company
 */

const express = require('express');
const router = express.Router();
const { getDeadlineStatus } = require('../utils/deadline');

/**
 * GET /company/:id
 * 
 * Returns the full normalized company record.
 * 
 * Response: Complete company object including officers, addresses, filing history,
 *           and deadline_warning flag when < 30 days to May 1.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.error('Company ID is required', 400);
    }
    
    // Get deadline status for warning flag
    const deadlineStatus = getDeadlineStatus();
    
    // TODO: Query AzureSQL database for company record
    // TODO: Include officers, addresses, filing history
    
    // Build response with deadline warning
    const response = {
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
      // Include deadline warning flag per product requirements
      deadline_warning: deadlineStatus.deadline_warning,
      filing_deadline: deadlineStatus.deadline,
      days_until_deadline: deadlineStatus.days_remaining,
      message: 'Database integration pending'
    };
    
    // Add warning message if deadline is approaching
    if (deadlineStatus.deadline_warning) {
      response.deadline_message = `WARNING: Florida Annual Report deadline is in ${deadlineStatus.days_remaining} days (May 1). Please complete your filing to avoid late fees.`;
    }
    
    res.success(response);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
