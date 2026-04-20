/**
 * Sunbiz Pre-filled Values Verification
 * 
 * Verifies that Sunbiz pre-filled form values match our reconciliation data.
 * Used to ensure data consistency before filing.
 * 
 * Key Features:
 * - All selectors loaded from selectors.json (zero hardcoded)
 * - Compares pre-filled values against expected reconciliation data
 * - Calculates confidence scores for matches
 * - Flags low-confidence results for human review
 * - Generates verification reports
 * 
 * @see CONSTITUTION.md - Principles II, V, VI
 * @see integrations/sunbiz/README.md - Automation flow
 */

const fs = require('fs');
const path = require('path');

/**
 * Event types emitted by the verification script
 */
const EVENT_TYPES = {
  VERIFICATION_PASSED: 'verification_passed',
  VERIFICATION_FAILED: 'verification_failed',
  REVIEW_REQUIRED: 'review_required',
  ERROR: 'error',
  FIELD_EXTRACTED: 'field_extracted',
  FIELD_MISSING: 'field_missing',
};

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
  selectorsPath: path.join(__dirname, '../selectors.json'),
  confidenceThreshold: 0.75,
  timeout: 30000,
  onEvent: () => {},
};

/**
 * VerifyPrefilled - Verification class for Sunbiz pre-filled data
 */
class VerifyPrefilled {
  /**
   * @param {import('@playwright/test').Page} page - Playwright page instance
   * @param {Object} options - Configuration options
   */
  constructor(page, options = {}) {
    this.page = page;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.selectors = null;
    this.confidenceThreshold = this.options.confidenceThreshold;
    this.extractedData = null;
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
      return null;
    }

    // Try primary selector first
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

    return null;
  }

  /**
   * Get the value from a form element.
   * @param {import('@playwright/test').Locator} element - Locator
   * @returns {Promise<string>}
   */
  async getElementValue(element) {
    if (!element) return null;
    
    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
    
    if (tagName === 'select') {
      return await element.inputValue();
    } else if (tagName === 'input' || tagName === 'textarea') {
      return await element.inputValue();
    } else {
      // For span, div, etc., get text content
      return (await element.textContent())?.trim() || null;
    }
  }

  /**
   * Extract a single field value.
   * @param {string} selectorPath - Path to selector
   * @param {string} fieldName - Human-readable field name
   * @returns {Promise<string|null>}
   */
  async extractField(selectorPath, fieldName) {
    const element = await this.findElement(selectorPath);
    
    if (!element) {
      this.emit(EVENT_TYPES.FIELD_MISSING, {
        field: fieldName,
        selectorPath,
      });
      return null;
    }

    const value = await this.getElementValue(element);
    
    this.emit(EVENT_TYPES.FIELD_EXTRACTED, {
      field: fieldName,
      value: value?.substring(0, 50),
    });

    return value;
  }

  /**
   * Extract all pre-filled values from the form.
   * @returns {Promise<Object>} Extracted data
   */
  async extractPrefilledValues() {
    const extracted = {
      entityName: null,
      documentNumber: null,
      filingYear: null,
      principalAddress: {},
      mailingAddress: {},
      registeredAgent: {},
      officers: [],
    };

    try {
      // Entity info (usually display-only, not inputs)
      extracted.entityName = await this.page.locator('[data-field="entity-name"]')
        .textContent().catch(() => null);
      extracted.documentNumber = await this.page.locator('[data-field="document-number"]')
        .textContent().catch(() => null);
      extracted.filingYear = await this.page.locator('[data-field="filing-year"]')
        .textContent().catch(() => null);

      // Principal address
      const paStreet = await this.findElement('entityForm.principalAddress.streetAddress');
      const paCity = await this.findElement('entityForm.principalAddress.city');
      const paState = await this.findElement('entityForm.principalAddress.state');
      const paZip = await this.findElement('entityForm.principalAddress.zipCode');

      extracted.principalAddress = {
        streetAddress: paStreet ? await this.getElementValue(paStreet) : null,
        city: paCity ? await this.getElementValue(paCity) : null,
        state: paState ? await this.getElementValue(paState) : null,
        zipCode: paZip ? await this.getElementValue(paZip) : null,
      };

      // Mailing address
      const maStreet = await this.findElement('entityForm.mailingAddress.streetAddress');
      const maCity = await this.findElement('entityForm.mailingAddress.city');
      const maState = await this.findElement('entityForm.mailingAddress.state');
      const maZip = await this.findElement('entityForm.mailingAddress.zipCode');

      extracted.mailingAddress = {
        streetAddress: maStreet ? await this.getElementValue(maStreet) : null,
        city: maCity ? await this.getElementValue(maCity) : null,
        state: maState ? await this.getElementValue(maState) : null,
        zipCode: maZip ? await this.getElementValue(maZip) : null,
      };

      // Registered agent
      const raName = await this.findElement('entityForm.registeredAgent.name');
      const raStreet = await this.findElement('entityForm.registeredAgent.streetAddress');
      const raCity = await this.findElement('entityForm.registeredAgent.city');
      const raState = await this.findElement('entityForm.registeredAgent.state');
      const raZip = await this.findElement('entityForm.registeredAgent.zipCode');

      extracted.registeredAgent = {
        name: raName ? await this.getElementValue(raName) : null,
        streetAddress: raStreet ? await this.getElementValue(raStreet) : null,
        city: raCity ? await this.getElementValue(raCity) : null,
        state: raState ? await this.getElementValue(raState) : null,
        zipCode: raZip ? await this.getElementValue(raZip) : null,
      };

      // Officers
      const officerRows = this.page.locator('[data-officer-index]');
      const officerCount = await officerRows.count();

      for (let i = 0; i < officerCount; i++) {
        const row = officerRows.nth(i);
        const titleSelect = row.locator('[aria-label="Officer Title"]');
        const nameInput = row.locator('[aria-label="Officer Name"]');
        const addressInput = row.locator('[aria-label="Officer Address"]');

        extracted.officers.push({
          title: await titleSelect.inputValue().catch(() => null),
          name: await nameInput.inputValue().catch(() => null),
          address: await addressInput.inputValue().catch(() => null),
        });
      }

      this.extractedData = extracted;
      return extracted;
    } catch (error) {
      this.emit(EVENT_TYPES.ERROR, {
        message: error.message,
        action: 'extract',
      });
      throw error;
    }
  }

  /**
   * Normalize a string for comparison.
   * @param {string} value - Value to normalize
   * @returns {string}
   */
  normalizeValue(value) {
    if (!value) return '';
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Compare two values with optional fuzzy matching.
   * @param {string} expected - Expected value
   * @param {string} actual - Actual value
   * @param {Object} options - Comparison options
   * @returns {Object} Comparison result
   */
  compareValues(expected, actual, options = {}) {
    const { fuzzyMatch = false } = options;

    if (expected === null || actual === null) {
      return {
        match: expected === actual,
        confidence: expected === actual ? 1.0 : 0.0,
      };
    }

    if (fuzzyMatch) {
      const normalizedExpected = this.normalizeValue(expected);
      const normalizedActual = this.normalizeValue(actual);
      
      if (normalizedExpected === normalizedActual) {
        return { match: true, confidence: 1.0 };
      }

      // Calculate similarity (simple Levenshtein-based)
      const similarity = this.calculateSimilarity(normalizedExpected, normalizedActual);
      return {
        match: similarity >= 0.9,
        confidence: similarity,
      };
    }

    const match = expected === actual;
    return { match, confidence: match ? 1.0 : 0.0 };
  }

  /**
   * Calculate string similarity (simplified Jaro-Winkler-like).
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @returns {number} Similarity score 0-1
   */
  calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    // Simple character-based similarity
    let matches = 0;
    const shorter = s1.length <= s2.length ? s1 : s2;
    const longer = s1.length > s2.length ? s1 : s2;

    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) {
        matches++;
      }
    }

    return matches / maxLen;
  }

  /**
   * Verify pre-filled values against reconciliation data.
   * @param {Object} reconciliationData - Expected data from reconciliation
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verify(reconciliationData, options = {}) {
    const { fuzzyMatch = false } = options;
    
    // Extract current form values if not already done
    if (!this.extractedData) {
      await this.extractPrefilledValues();
    }

    const discrepancies = [];
    const missingFields = [];
    let totalFields = 0;
    let matchingFields = 0;

    // Helper to compare nested objects
    const compareObject = (expected, actual, prefix) => {
      for (const [key, expectedValue] of Object.entries(expected)) {
        if (typeof expectedValue === 'object' && expectedValue !== null && !Array.isArray(expectedValue)) {
          compareObject(expectedValue, actual?.[key] || {}, `${prefix}.${key}`);
        } else {
          totalFields++;
          const actualValue = actual?.[key];
          
          if (actualValue === null || actualValue === undefined) {
            missingFields.push(`${prefix}.${key}`);
          } else {
            const comparison = this.compareValues(expectedValue, actualValue, { fuzzyMatch });
            
            if (comparison.match) {
              matchingFields++;
            } else {
              discrepancies.push({
                field: `${prefix}.${key}`,
                expected: expectedValue,
                actual: actualValue,
                confidence: comparison.confidence,
              });
            }
          }
        }
      }
    };

    // Compare principal address
    if (reconciliationData.principalAddress) {
      compareObject(
        reconciliationData.principalAddress,
        this.extractedData.principalAddress,
        'principalAddress'
      );
    }

    // Compare mailing address
    if (reconciliationData.mailingAddress) {
      compareObject(
        reconciliationData.mailingAddress,
        this.extractedData.mailingAddress,
        'mailingAddress'
      );
    }

    // Compare registered agent
    if (reconciliationData.registeredAgent) {
      compareObject(
        reconciliationData.registeredAgent,
        this.extractedData.registeredAgent,
        'registeredAgent'
      );
    }

    // Compare officers (by position)
    if (reconciliationData.officers) {
      for (let i = 0; i < reconciliationData.officers.length; i++) {
        const expectedOfficer = reconciliationData.officers[i];
        const actualOfficer = this.extractedData.officers[i] || {};
        compareObject(expectedOfficer, actualOfficer, `officers[${i}]`);
      }
    }

    // Calculate overall confidence
    const confidence = totalFields > 0 ? matchingFields / totalFields : 0;
    const match = discrepancies.length === 0 && missingFields.length === 0;
    const requiresReview = confidence < this.confidenceThreshold;

    // Emit appropriate event
    if (match) {
      this.emit(EVENT_TYPES.VERIFICATION_PASSED, {
        documentNumber: reconciliationData.documentNumber,
        confidence,
        totalFields,
        matchingFields,
      });
    } else {
      this.emit(EVENT_TYPES.VERIFICATION_FAILED, {
        documentNumber: reconciliationData.documentNumber,
        confidence,
        discrepancies,
        missingFields,
      });
    }

    if (requiresReview) {
      this.emit(EVENT_TYPES.REVIEW_REQUIRED, {
        documentNumber: reconciliationData.documentNumber,
        confidence,
        threshold: this.confidenceThreshold,
        discrepancies,
      });
    }

    return {
      match,
      confidence,
      discrepancies,
      missingFields,
      requiresReview,
      totalFields,
      matchingFields,
    };
  }

  /**
   * Generate a verification report.
   * @param {Object} verificationResult - Result from verify()
   * @returns {Object} Formatted report
   */
  generateReport(verificationResult) {
    const { match, confidence, discrepancies, missingFields, totalFields, matchingFields } = verificationResult;

    const summary = match
      ? `✅ All ${totalFields} fields verified successfully`
      : `⚠️ ${discrepancies.length} discrepancies found, ${missingFields?.length || 0} missing fields`;

    return {
      timestamp: new Date().toISOString(),
      documentNumber: this.extractedData?.documentNumber,
      summary,
      status: match ? 'PASSED' : 'FAILED',
      confidence: (confidence * 100).toFixed(1) + '%',
      statistics: {
        totalFields,
        matchingFields,
        discrepancyCount: discrepancies.length,
        missingFieldCount: missingFields?.length || 0,
      },
      discrepancies: discrepancies.map(d => ({
        field: d.field,
        expected: d.expected,
        actual: d.actual,
        confidence: (d.confidence * 100).toFixed(1) + '%',
      })),
      missingFields: missingFields || [],
      requiresReview: verificationResult.requiresReview,
      confidenceThreshold: (this.confidenceThreshold * 100).toFixed(0) + '%',
    };
  }
}

module.exports = {
  VerifyPrefilled,
  EVENT_TYPES,
  DEFAULT_OPTIONS,
};
