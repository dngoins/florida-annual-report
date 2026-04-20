/**
 * Submit Route
 * 
 * Triggers the Playwright automation agent to submit annual report.
 * POST /submit - Submit annual report to Sunbiz
 * 
 * CRITICAL: This route enforces:
 * 1. Human-in-the-loop requirement (user_approved: true)
 * 2. Filing deadline enforcement (blocked after May 1)
 * 
 * @module routes/submit
 */

const express = require('express');
const router = express.Router();
const { createDeadlineEnforcer } = require('../middleware/deadlineCheck');

// Create deadline enforcer middleware
// Can be overridden for testing by setting req.dateOverride
const deadlineEnforcer = createDeadlineEnforcer();

/**
 * POST /submit
 * 
 * Triggers the Playwright automation agent to submit the annual report.
 * 
 * Request: { company_id: string, filing_id: string, user_approved: true }
 * Response: { submission_id: string, status: "in_progress" }
 * 
 * BLOCKS with 422 if:
 * - Current date is past May 1 (filing deadline)
 * 
 * REQUIRES user_approved: true - submission is blocked without explicit user approval.
 */
router.post('/', deadlineEnforcer, async (req, res, next) => {
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
