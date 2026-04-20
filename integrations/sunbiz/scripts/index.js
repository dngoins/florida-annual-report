/**
 * Sunbiz Automation Scripts - Entry Point
 * 
 * This module exports the main automation scripts for Sunbiz annual report filing.
 * 
 * @module integrations/sunbiz/scripts
 * @see CONSTITUTION.md for governing principles
 * @see integrations/sunbiz/README.md for automation flow
 */

const { FillAnnualReport, EVENT_TYPES: FILL_EVENTS, DEFAULT_OPTIONS: FILL_OPTIONS } = require('./fill-annual-report');
const { VerifyPrefilled, EVENT_TYPES: VERIFY_EVENTS, DEFAULT_OPTIONS: VERIFY_OPTIONS } = require('./verify-prefilled');

/**
 * Combined event types from all scripts
 */
const EVENT_TYPES = {
  // Fill events
  FIELD_FILLED: FILL_EVENTS.FIELD_FILLED,
  CAPTCHA_REACHED: FILL_EVENTS.CAPTCHA_REACHED,
  PAYMENT_REACHED: FILL_EVENTS.PAYMENT_REACHED,
  ERROR: FILL_EVENTS.ERROR,
  NAVIGATION: FILL_EVENTS.NAVIGATION,
  SELECTOR_FALLBACK: FILL_EVENTS.SELECTOR_FALLBACK,
  FORM_COMPLETE: FILL_EVENTS.FORM_COMPLETE,
  SUBMISSION_BLOCKED: FILL_EVENTS.SUBMISSION_BLOCKED,
  
  // Verify events
  VERIFICATION_PASSED: VERIFY_EVENTS.VERIFICATION_PASSED,
  VERIFICATION_FAILED: VERIFY_EVENTS.VERIFICATION_FAILED,
  REVIEW_REQUIRED: VERIFY_EVENTS.REVIEW_REQUIRED,
  FIELD_EXTRACTED: VERIFY_EVENTS.FIELD_EXTRACTED,
  FIELD_MISSING: VERIFY_EVENTS.FIELD_MISSING,
};

/**
 * Create a complete automation workflow.
 * 
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} options - Configuration options
 * @returns {Object} Workflow object with fill and verify methods
 * 
 * @example
 * const workflow = createWorkflow(page, { onEvent: console.log });
 * await workflow.loadSelectors();
 * 
 * // Verify pre-filled data matches
 * const verification = await workflow.verifyPrefilled(reconciliationData);
 * 
 * // Fill form with entity data
 * const result = await workflow.fillForm(entityData);
 */
function createWorkflow(page, options = {}) {
  const fillScript = new FillAnnualReport(page, options);
  const verifyScript = new VerifyPrefilled(page, options);

  return {
    /**
     * Load selectors for both scripts
     */
    async loadSelectors() {
      await fillScript.loadSelectors();
      await verifyScript.loadSelectors();
    },

    /**
     * Verify pre-filled values against reconciliation data
     * @param {Object} reconciliationData - Expected data
     * @param {Object} options - Verification options
     */
    async verifyPrefilled(reconciliationData, options = {}) {
      return verifyScript.verify(reconciliationData, options);
    },

    /**
     * Fill the annual report form
     * @param {Object} entityData - Entity data to fill
     */
    async fillForm(entityData) {
      return fillScript.fillForm(entityData);
    },

    /**
     * Submit the form (requires user approval)
     * @param {Object} options - Must include userApproved: true
     */
    async submit(options) {
      return fillScript.submit(options);
    },

    /**
     * Capture confirmation page details
     */
    async captureConfirmation() {
      return fillScript.captureConfirmation();
    },

    /**
     * Generate verification report
     * @param {Object} verificationResult - Result from verifyPrefilled
     */
    generateReport(verificationResult) {
      return verifyScript.generateReport(verificationResult);
    },

    // Expose underlying scripts for advanced usage
    fillScript,
    verifyScript,
  };
}

module.exports = {
  FillAnnualReport,
  VerifyPrefilled,
  EVENT_TYPES,
  createWorkflow,
};
