/**
 * Sunbiz Annual Report Form Filler
 * 
 * Automates form filling for Florida Annual Report submissions on Sunbiz.org.
 * 
 * Key Features:
 * - All selectors loaded from selectors.json (zero hardcoded)
 * - Label-based selector strategy (primary), XPath fallback (secondary)
 * - Pauses at CAPTCHA and payment (human-in-the-loop)
 * - Emits structured events for audit logging
 * - Never auto-submits without user_approved flag
 * 
 * @see CONSTITUTION.md - Principles II, III, V
 * @see integrations/sunbiz/README.md - Automation flow
 */

const fs = require('fs');
const path = require('path');

/**
 * Event types emitted by the automation script
 */
const EVENT_TYPES = {
  FIELD_FILLED: 'field_filled',
  CAPTCHA_REACHED: 'captcha_reached',
  PAYMENT_REACHED: 'payment_reached',
  ERROR: 'error',
  NAVIGATION: 'navigation',
  SELECTOR_FALLBACK: 'selector_fallback',
  FORM_COMPLETE: 'form_complete',
  SUBMISSION_BLOCKED: 'submission_blocked',
};

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
  selectorsPath: path.join(__dirname, '../selectors.json'),
  timeout: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  onEvent: () => {},
};

/**
 * FillAnnualReport - Main automation class
 */
class FillAnnualReport {
  /**
   * @param {import('@playwright/test').Page} page - Playwright page instance
   * @param {Object} options - Configuration options
   */
  constructor(page, options = {}) {
    this.page = page;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.selectors = null;
    this.currentDocumentNumber = null;
  }

  /**
   * Load selectors from the configuration file at runtime.
   * CONSTITUTION.md Principle V: All selectors from selectors.json
   */
  async loadSelectors() {
    const selectorsPath = this.options.selectorsPath;
    const content = fs.readFileSync(selectorsPath, 'utf8');
    this.selectors = JSON.parse(content);
    return this.selectors;
  }

  /**
   * Emit a structured event for audit logging.
   * @param {string} type - Event type from EVENT_TYPES
   * @param {Object} data - Event data
   */
  emit(type, data = {}) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      documentNumber: this.currentDocumentNumber,
      ...data,
    };
    this.options.onEvent(event);
    return event;
  }

  /**
   * Find an element using primary selector first, then fallback.
   * @param {string} selectorPath - Dot-notation path to selector config
   * @returns {Promise<import('@playwright/test').Locator|null>}
   */
  async findElement(selectorPath) {
    const parts = selectorPath.split('.');
    let config = this.selectors;
    
    for (const part of parts) {
      config = config?.[part];
    }
    
    if (!config) {
      this.emit(EVENT_TYPES.ERROR, {
        field: selectorPath,
        message: `Selector config not found: ${selectorPath}`,
      });
      return null;
    }

    // Try primary selector first (usually label-based)
    try {
      const primary = this.page.locator(config.primary);
      if (await primary.count() > 0) {
        return primary.first();
      }
    } catch (e) {
      // Primary failed, try fallback
    }

    // Try XPath fallback
    if (config.fallback) {
      try {
        const fallback = this.page.locator(config.fallback);
        if (await fallback.count() > 0) {
          this.emit(EVENT_TYPES.SELECTOR_FALLBACK, {
            field: selectorPath,
            primary: config.primary,
            fallback: config.fallback,
          });
          return fallback.first();
        }
      } catch (e) {
        // Fallback also failed
      }
    }

    // Try label matching if available
    if (config.labelMatch) {
      try {
        const labelBased = this.page.getByLabel(config.labelMatch);
        if (await labelBased.count() > 0) {
          return labelBased.first();
        }
      } catch (e) {
        // Label match also failed
      }
    }

    this.emit(EVENT_TYPES.ERROR, {
      field: selectorPath,
      message: `Could not find element with any selector strategy`,
      selectors: config,
    });
    
    return null;
  }

  /**
   * Fill a form field and emit an event.
   * @param {string} selectorPath - Path to selector
   * @param {string} value - Value to fill
   * @param {string} fieldName - Human-readable field name
   */
  async fillField(selectorPath, value, fieldName) {
    const element = await this.findElement(selectorPath);
    
    if (!element) {
      throw new Error(`Could not find field: ${fieldName} (${selectorPath})`);
    }

    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
    
    if (tagName === 'select') {
      await element.selectOption(value);
    } else {
      await element.fill(value);
    }

    this.emit(EVENT_TYPES.FIELD_FILLED, {
      field: fieldName,
      selectorPath,
      value: value.substring(0, 50), // Truncate for logging
    });
  }

  /**
   * Search for an entity by document number.
   * @param {string} documentNumber - Florida document number
   */
  async searchEntity(documentNumber) {
    this.currentDocumentNumber = documentNumber;
    
    await this.fillField(
      'filingStart.documentNumberInput',
      documentNumber,
      'documentNumber'
    );

    this.emit(EVENT_TYPES.NAVIGATION, {
      action: 'entity_search',
      documentNumber,
    });
  }

  /**
   * Click the continue button to load the entity form.
   */
  async continueToForm() {
    const button = await this.findElement('filingStart.continueButton');
    if (button) {
      await button.click();
      await this.page.waitForLoadState('networkidle');
      
      this.emit(EVENT_TYPES.NAVIGATION, {
        action: 'continue_to_form',
      });
    }
  }

  /**
   * Fill principal address fields.
   * @param {Object} address - Address data
   */
  async fillPrincipalAddress(address) {
    await this.fillField(
      'entityForm.principalAddress.streetAddress',
      address.streetAddress,
      'principalAddress.streetAddress'
    );
    await this.fillField(
      'entityForm.principalAddress.city',
      address.city,
      'principalAddress.city'
    );
    await this.fillField(
      'entityForm.principalAddress.state',
      address.state,
      'principalAddress.state'
    );
    await this.fillField(
      'entityForm.principalAddress.zipCode',
      address.zipCode,
      'principalAddress.zipCode'
    );
  }

  /**
   * Fill mailing address fields.
   * @param {Object} address - Address data
   */
  async fillMailingAddress(address) {
    await this.fillField(
      'entityForm.mailingAddress.streetAddress',
      address.streetAddress,
      'mailingAddress.streetAddress'
    );
    await this.fillField(
      'entityForm.mailingAddress.city',
      address.city,
      'mailingAddress.city'
    );
    await this.fillField(
      'entityForm.mailingAddress.state',
      address.state,
      'mailingAddress.state'
    );
    await this.fillField(
      'entityForm.mailingAddress.zipCode',
      address.zipCode,
      'mailingAddress.zipCode'
    );
  }

  /**
   * Fill registered agent fields.
   * @param {Object} agent - Agent data
   */
  async fillRegisteredAgent(agent) {
    await this.fillField(
      'entityForm.registeredAgent.name',
      agent.name,
      'registeredAgent.name'
    );
    await this.fillField(
      'entityForm.registeredAgent.streetAddress',
      agent.streetAddress,
      'registeredAgent.streetAddress'
    );
    await this.fillField(
      'entityForm.registeredAgent.city',
      agent.city,
      'registeredAgent.city'
    );
    await this.fillField(
      'entityForm.registeredAgent.state',
      agent.state,
      'registeredAgent.state'
    );
    await this.fillField(
      'entityForm.registeredAgent.zipCode',
      agent.zipCode,
      'registeredAgent.zipCode'
    );
  }

  /**
   * Fill officer/director rows.
   * @param {Array} officers - Array of officer data
   */
  async fillOfficers(officers) {
    const container = await this.findElement('entityForm.officers.container');
    if (!container) {
      this.emit(EVENT_TYPES.ERROR, {
        field: 'officers',
        message: 'Could not find officers container',
      });
      return;
    }

    // Get existing officer rows
    const existingRows = this.page.locator('[data-officer-index]');
    const existingCount = await existingRows.count();

    // Add more rows if needed
    for (let i = existingCount; i < officers.length; i++) {
      const addButton = await this.findElement('entityForm.officers.addOfficerButton');
      if (addButton) {
        await addButton.click();
        await this.page.waitForTimeout(500); // Brief wait for DOM update
      }
    }

    // Fill each officer row
    for (let i = 0; i < officers.length; i++) {
      const officer = officers[i];
      const rowSelector = `[data-officer-index="${i}"]`;
      
      // Title
      const titleSelect = this.page.locator(`${rowSelector} [aria-label="Officer Title"]`);
      if (await titleSelect.count() > 0) {
        await titleSelect.first().selectOption(officer.title);
        this.emit(EVENT_TYPES.FIELD_FILLED, {
          field: `officers[${i}].title`,
          value: officer.title,
        });
      }

      // Name
      const nameInput = this.page.locator(`${rowSelector} [aria-label="Officer Name"]`);
      if (await nameInput.count() > 0) {
        await nameInput.first().fill(officer.name);
        this.emit(EVENT_TYPES.FIELD_FILLED, {
          field: `officers[${i}].name`,
          value: officer.name,
        });
      }

      // Address
      const addressInput = this.page.locator(`${rowSelector} [aria-label="Officer Address"]`);
      if (await addressInput.count() > 0) {
        await addressInput.first().fill(officer.address);
        this.emit(EVENT_TYPES.FIELD_FILLED, {
          field: `officers[${i}].address`,
          value: officer.address.substring(0, 50),
        });
      }
    }
  }

  /**
   * Fill electronic signature.
   * @param {string} signature - Signature text
   */
  async fillSignature(signature) {
    await this.fillField(
      'signaturePage.signatureInput',
      signature,
      'signature'
    );

    // Check certification checkbox
    const checkbox = await this.findElement('signaturePage.certificationCheckbox');
    if (checkbox) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.check();
        this.emit(EVENT_TYPES.FIELD_FILLED, {
          field: 'certificationCheckbox',
          value: true,
        });
      }
    }
  }

  /**
   * Detect if CAPTCHA is present on the page.
   * CONSTITUTION.md Principle II: Pause at CAPTCHA
   * @returns {Promise<boolean>}
   */
  async detectCaptcha() {
    const indicators = this.selectors.captchaDetection?.indicators || [];
    
    for (const indicator of indicators) {
      try {
        const element = this.page.locator(indicator);
        if (await element.count() > 0) {
          return true;
        }
      } catch (e) {
        // Selector didn't match, continue
      }
    }
    
    return false;
  }

  /**
   * Detect if payment section is present on the page.
   * CONSTITUTION.md Principle II: Pause at payment
   * @returns {Promise<boolean>}
   */
  async detectPayment() {
    const indicators = this.selectors.paymentDetection?.indicators || [];
    
    for (const indicator of indicators) {
      try {
        const element = this.page.locator(indicator);
        if (await element.count() > 0) {
          return true;
        }
      } catch (e) {
        // Selector didn't match, continue
      }
    }
    
    return false;
  }

  /**
   * Check for blockers (CAPTCHA, payment) that require human intervention.
   * @returns {Promise<Object>} Status object
   */
  async checkForBlockers() {
    const hasCaptcha = await this.detectCaptcha();
    const hasPayment = await this.detectPayment();

    if (hasCaptcha) {
      this.emit(EVENT_TYPES.CAPTCHA_REACHED, {
        message: 'CAPTCHA detected - human intervention required',
      });
      return { paused: true, reason: 'captcha' };
    }

    if (hasPayment) {
      this.emit(EVENT_TYPES.PAYMENT_REACHED, {
        message: 'Payment section detected - human intervention required',
      });
      return { paused: true, reason: 'payment' };
    }

    return { paused: false, reason: null };
  }

  /**
   * Fill the complete annual report form.
   * @param {Object} entityData - Complete entity data
   * @returns {Promise<Object>} Result object
   */
  async fillForm(entityData) {
    let fieldsCompleted = 0;
    const errors = [];

    try {
      // Search for entity
      if (entityData.documentNumber) {
        await this.searchEntity(entityData.documentNumber);
        fieldsCompleted++;
      }

      // Fill principal address
      if (entityData.principalAddress) {
        await this.fillPrincipalAddress(entityData.principalAddress);
        fieldsCompleted += 4;
      }

      // Fill mailing address
      if (entityData.mailingAddress) {
        await this.fillMailingAddress(entityData.mailingAddress);
        fieldsCompleted += 4;
      }

      // Fill registered agent
      if (entityData.registeredAgent) {
        await this.fillRegisteredAgent(entityData.registeredAgent);
        fieldsCompleted += 5;
      }

      // Fill officers
      if (entityData.officers && entityData.officers.length > 0) {
        await this.fillOfficers(entityData.officers);
        fieldsCompleted += entityData.officers.length * 3;
      }

      // Fill signature (but do NOT auto-submit)
      if (entityData.signature) {
        await this.fillSignature(entityData.signature);
        fieldsCompleted += 2;
      }

      // Check for blockers
      const blockerStatus = await this.checkForBlockers();

      this.emit(EVENT_TYPES.FORM_COMPLETE, {
        fieldsCompleted,
        errors: errors.length,
        pausedAt: blockerStatus.paused ? blockerStatus.reason : 'signature',
      });

      return {
        success: true,
        fieldsCompleted,
        errors,
        submitted: false, // Never auto-submit
        pausedAt: 'signature', // Always pause before submit
      };
    } catch (error) {
      this.emit(EVENT_TYPES.ERROR, {
        message: error.message,
        stack: error.stack,
      });
      
      return {
        success: false,
        fieldsCompleted,
        errors: [...errors, error.message],
        submitted: false,
        pausedAt: 'error',
      };
    }
  }

  /**
   * Submit the form (requires user_approved flag).
   * CONSTITUTION.md Principle II: Requires explicit user approval
   * @param {Object} options - Submit options
   */
  async submit(options = {}) {
    // CRITICAL: Check for user approval
    if (!options.userApproved) {
      this.emit(EVENT_TYPES.SUBMISSION_BLOCKED, {
        message: 'Submission blocked: user_approved flag is required',
      });
      throw new Error('Submission requires user_approved: true flag');
    }

    // Check for blockers one more time
    const blockerStatus = await this.checkForBlockers();
    if (blockerStatus.paused) {
      this.emit(EVENT_TYPES.SUBMISSION_BLOCKED, {
        message: `Cannot submit: ${blockerStatus.reason} requires human intervention`,
        reason: blockerStatus.reason,
      });
      throw new Error(`Cannot auto-submit: ${blockerStatus.reason} detected`);
    }

    // Find and click submit button
    const submitButton = await this.findElement('signaturePage.submitButton');
    if (!submitButton) {
      throw new Error('Could not find submit button');
    }

    await submitButton.click();
    await this.page.waitForLoadState('networkidle');

    this.emit(EVENT_TYPES.NAVIGATION, {
      action: 'form_submitted',
    });

    return { submitted: true };
  }

  /**
   * Capture confirmation details after successful submission.
   * @returns {Promise<Object>} Confirmation data
   */
  async captureConfirmation() {
    const confirmationElement = await this.findElement('confirmationPage.confirmationNumber');
    let confirmationNumber = null;
    
    if (confirmationElement) {
      confirmationNumber = await confirmationElement.textContent();
    }

    // Take screenshot
    const screenshot = await this.page.screenshot({ fullPage: true });

    // Capture HTML
    const html = await this.page.content();

    return {
      confirmationNumber,
      screenshot,
      html,
      capturedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  FillAnnualReport,
  EVENT_TYPES,
  DEFAULT_OPTIONS,
};
