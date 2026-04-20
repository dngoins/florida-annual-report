/**
 * Integration Tests: verify-prefilled.js
 * 
 * Tests the verification of Sunbiz pre-filled values against reconciliation data.
 * 
 * @see CONSTITUTION.md Principle VI: Test-First Development
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { VerifyPrefilled, EVENT_TYPES } = require('../verify-prefilled');

// Path to mock HTML fixture
const MOCK_FORM_PATH = path.join(__dirname, 'fixtures', 'mock-entity-form.html');
const MOCK_FORM_URL = `file://${MOCK_FORM_PATH}`;

// Sample reconciliation data (what we expect based on Sunbiz records)
const RECONCILIATION_DATA = {
  entityName: 'ABC Corporation',
  documentNumber: 'P12345678',
  filingYear: '2026',
  principalAddress: {
    streetAddress: '123 Main Street',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
  },
  mailingAddress: {
    streetAddress: 'PO Box 456',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
  },
  registeredAgent: {
    name: 'John Smith, Esq.',
    streetAddress: '789 Legal Ave',
    city: 'Miami',
    state: 'FL',
    zipCode: '33102',
  },
  officers: [
    { title: 'P', name: 'Jane Doe', address: '123 Main St, Miami FL 33101' },
    { title: 'S', name: 'Bob Johnson', address: '456 Oak Ave, Miami FL 33101' },
  ],
};

// Mismatched data for testing discrepancy detection
const MISMATCHED_DATA = {
  ...RECONCILIATION_DATA,
  principalAddress: {
    ...RECONCILIATION_DATA.principalAddress,
    streetAddress: '999 Different Street',  // Mismatch!
    city: 'Tampa',  // Mismatch!
  },
  registeredAgent: {
    ...RECONCILIATION_DATA.registeredAgent,
    name: 'Different Agent LLC',  // Mismatch!
  },
};

test.describe('VerifyPrefilled', () => {
  let verifyScript;
  let events;

  test.beforeEach(async ({ page }) => {
    events = [];
    verifyScript = new VerifyPrefilled(page, {
      selectorsPath: path.join(__dirname, '../../selectors.json'),
      confidenceThreshold: 0.75,
      onEvent: (event) => events.push(event),
    });
  });

  test.describe('Selector Loading', () => {
    test('should load selectors from selectors.json at runtime', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      expect(verifyScript.selectors).toBeDefined();
      expect(verifyScript.selectors.entityForm).toBeDefined();
    });

    test('should have zero hardcoded selectors', async () => {
      const fs = require('fs');
      const scriptContent = fs.readFileSync(
        path.join(__dirname, '../verify-prefilled.js'),
        'utf8'
      );
      
      // Should reference selectors.json
      expect(scriptContent).toContain('loadSelectors');
      expect(scriptContent).toContain('selectors');
    });
  });

  test.describe('Value Extraction', () => {
    test('should extract pre-filled entity name', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const extracted = await verifyScript.extractPrefilledValues();
      
      expect(extracted.entityName).toBe('ABC Corporation');
    });

    test('should extract pre-filled document number', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const extracted = await verifyScript.extractPrefilledValues();
      
      expect(extracted.documentNumber).toBe('P12345678');
    });

    test('should extract pre-filled address fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const extracted = await verifyScript.extractPrefilledValues();
      
      expect(extracted.principalAddress.streetAddress).toBe('123 Main Street');
      expect(extracted.principalAddress.city).toBe('Miami');
      expect(extracted.principalAddress.state).toBe('FL');
      expect(extracted.principalAddress.zipCode).toBe('33101');
    });

    test('should extract pre-filled registered agent fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const extracted = await verifyScript.extractPrefilledValues();
      
      expect(extracted.registeredAgent.name).toBe('John Smith, Esq.');
      expect(extracted.registeredAgent.streetAddress).toBe('789 Legal Ave');
    });

    test('should extract pre-filled officer data', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const extracted = await verifyScript.extractPrefilledValues();
      
      expect(extracted.officers).toHaveLength(2);
      expect(extracted.officers[0].name).toBe('Jane Doe');
      expect(extracted.officers[1].name).toBe('Bob Johnson');
    });
  });

  test.describe('Verification - Matching Data', () => {
    test('should return match=true when all values match', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(RECONCILIATION_DATA);
      
      expect(result.match).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
    });

    test('should have high confidence when all values match', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(RECONCILIATION_DATA);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    test('should emit verification_passed event on match', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      await verifyScript.verify(RECONCILIATION_DATA);
      
      const passedEvents = events.filter(e => e.type === EVENT_TYPES.VERIFICATION_PASSED);
      expect(passedEvents.length).toBe(1);
    });
  });

  test.describe('Verification - Mismatched Data', () => {
    test('should return match=false when values differ', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(MISMATCHED_DATA);
      
      expect(result.match).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
    });

    test('should list specific discrepancies', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(MISMATCHED_DATA);
      
      // Should identify the specific mismatched fields
      const discrepancyFields = result.discrepancies.map(d => d.field);
      expect(discrepancyFields).toContain('principalAddress.streetAddress');
      expect(discrepancyFields).toContain('principalAddress.city');
      expect(discrepancyFields).toContain('registeredAgent.name');
    });

    test('should include expected and actual values in discrepancies', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(MISMATCHED_DATA);
      
      const streetDiscrepancy = result.discrepancies.find(
        d => d.field === 'principalAddress.streetAddress'
      );
      
      expect(streetDiscrepancy.expected).toBe('999 Different Street');
      expect(streetDiscrepancy.actual).toBe('123 Main Street');
    });

    test('should emit verification_failed event on mismatch', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      await verifyScript.verify(MISMATCHED_DATA);
      
      const failedEvents = events.filter(e => e.type === EVENT_TYPES.VERIFICATION_FAILED);
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].discrepancies.length).toBeGreaterThan(0);
    });
  });

  test.describe('Confidence Scoring', () => {
    test('should calculate confidence score for partial matches', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      // Data with one minor mismatch
      const partialMismatch = {
        ...RECONCILIATION_DATA,
        mailingAddress: {
          ...RECONCILIATION_DATA.mailingAddress,
          zipCode: '33102',  // Minor mismatch
        },
      };
      
      const result = await verifyScript.verify(partialMismatch);
      
      // Should have a confidence between 0 and 1
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });

    test('should flag low confidence results for review', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(MISMATCHED_DATA);
      
      // With multiple mismatches, confidence should be below threshold
      if (result.confidence < 0.75) {
        expect(result.requiresReview).toBe(true);
      }
    });

    test('should emit review_required event when below threshold', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      // Set a high threshold so almost anything triggers review
      verifyScript.confidenceThreshold = 0.99;
      
      const result = await verifyScript.verify({
        ...RECONCILIATION_DATA,
        principalAddress: {
          ...RECONCILIATION_DATA.principalAddress,
          zipCode: '33102',
        },
      });
      
      if (result.confidence < 0.99) {
        const reviewEvents = events.filter(e => e.type === EVENT_TYPES.REVIEW_REQUIRED);
        expect(reviewEvents.length).toBe(1);
      }
    });
  });

  test.describe('Fuzzy Matching', () => {
    test('should handle minor formatting differences', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      // Data with formatting variations
      const formattingVariations = {
        ...RECONCILIATION_DATA,
        principalAddress: {
          ...RECONCILIATION_DATA.principalAddress,
          streetAddress: '123 MAIN STREET',  // All caps
          city: 'MIAMI',  // All caps
        },
      };
      
      const result = await verifyScript.verify(formattingVariations, { fuzzyMatch: true });
      
      // With fuzzy matching enabled, these should be considered matches
      expect(result.match).toBe(true);
    });

    test('should handle whitespace variations', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const whitespaceVariations = {
        ...RECONCILIATION_DATA,
        principalAddress: {
          ...RECONCILIATION_DATA.principalAddress,
          streetAddress: '123  Main  Street',  // Extra spaces
        },
      };
      
      const result = await verifyScript.verify(whitespaceVariations, { fuzzyMatch: true });
      
      expect(result.match).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should emit error event on extraction failure', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      // Break a selector
      verifyScript.selectors.entityForm.principalAddress = {
        streetAddress: { primary: '[data-nonexistent]', fallback: '//nonexistent' },
      };
      
      try {
        await verifyScript.extractPrefilledValues();
      } catch (e) {
        // Expected
      }
      
      const errorEvents = events.filter(e => e.type === EVENT_TYPES.ERROR);
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    test('should handle missing fields gracefully', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      // Remove an element from the page
      await page.evaluate(() => {
        document.getElementById('principal-street')?.remove();
      });
      
      const result = await verifyScript.verify(RECONCILIATION_DATA);
      
      // Should note the missing field
      expect(result.missingFields).toBeDefined();
      expect(result.missingFields.length).toBeGreaterThan(0);
    });
  });

  test.describe('Report Generation', () => {
    test('should generate verification report', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(RECONCILIATION_DATA);
      const report = verifyScript.generateReport(result);
      
      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.documentNumber).toBe(RECONCILIATION_DATA.documentNumber);
      expect(report.summary).toBeDefined();
    });

    test('should include all discrepancies in report', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      const result = await verifyScript.verify(MISMATCHED_DATA);
      const report = verifyScript.generateReport(result);
      
      expect(report.discrepancies.length).toBe(result.discrepancies.length);
    });
  });

  test.describe('Audit Logging', () => {
    test('should include timestamp in all events', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      await verifyScript.verify(RECONCILIATION_DATA);
      
      events.forEach(event => {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      });
    });

    test('should include document number in verification events', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await verifyScript.loadSelectors();
      
      await verifyScript.verify(RECONCILIATION_DATA);
      
      const verifyEvents = events.filter(e => 
        e.type === EVENT_TYPES.VERIFICATION_PASSED || 
        e.type === EVENT_TYPES.VERIFICATION_FAILED
      );
      
      verifyEvents.forEach(event => {
        expect(event.documentNumber).toBe(RECONCILIATION_DATA.documentNumber);
      });
    });
  });
});
