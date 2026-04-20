/**
 * Submit Route
 * 
 * Triggers the Playwright automation agent to submit annual report.
 * POST /submit - Submit annual report to Sunbiz
 * 
 * CRITICAL: This route enforces the human-in-the-loop requirement.
 * Submissions are BLOCKED without explicit user_approved: true
 * 
 * @module routes/submit
 */

const express = require('express');
const router = express.Router();

/**
 * POST /submit
 * 
 * Triggers the Playwright automation agent to submit the annual report.
 * 
 * Request: { company_id: string, filing_id: string, user_approved: true }
 * Response: { submission_id: string, status: "in_progress" }
 * 
 * REQUIRES user_approved: true - submission is blocked without explicit user approval.
 */
router.post('/', async (req, res, next) => {
  try {
    const { company_id, filing_id, user_approved } = req.body;
    
    // Validate required fields
    if (!company_id) {
      return res.error('company_id is required', 400);
    }
    
    if (!filing_id) {
      return res.error('filing_id is required', 400);
    }
    
    // CRITICAL: Enforce user approval requirement per CONSTITUTION.md and CLAUDE.md
    // This is a non-negotiable safety gate
    if (user_approved !== true) {
      return res.error(
        'Submission blocked: user_approved must be explicitly set to true. ' +
        'Annual report submissions require explicit user approval before proceeding.',
        403,
        { 
          code: 'USER_APPROVAL_REQUIRED',
          hint: 'Set user_approved: true in your request after reviewing all data'
        }
      );
    }
    
    // TODO: Verify all fields have confidence >= 0.75
    // TODO: Log submission attempt to audit_logs
    // TODO: Integrate with Automation Agent (Playwright)
    // TODO: Stop at CAPTCHA and payment for human intervention
    
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Placeholder response - will be implemented when Automation Agent is ready
    res.success({
      submission_id: submissionId,
      company_id,
      filing_id,
      status: 'in_progress',
      message: 'Submission queued. Automation agent will pause at CAPTCHA and payment for human intervention.'
    }, 202);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
