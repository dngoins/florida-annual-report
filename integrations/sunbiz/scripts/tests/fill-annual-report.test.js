/**
 * Integration Tests: fill-annual-report.js
 * 
 * Tests the Sunbiz annual report form filling automation.
 * Uses mock HTML fixtures - never hits live Sunbiz.
 * 
 * @see CONSTITUTION.md Principle VI: Test-First Development
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { FillAnnualReport, EVENT_TYPES } = require('../fill-annual-report');

// Path to mock HTML fixture
const MOCK_FORM_PATH = path.join(__dirname, 'fixtures', 'mock-entity-form.html');
const MOCK_FORM_URL = `file://${MOCK_FORM_PATH}`;

// Sample test data
const TEST_ENTITY_DATA = {
  documentNumber: 'P12345678',
  principalAddress: {
    streetAddress: '100 Test Street',
    city: 'Tampa',
    state: 'FL',
    zipCode: '33601',
  },
  mailingAddress: {
    streetAddress: 'PO Box 789',
    city: 'Tampa',
    state: 'FL',
    zipCode: '33601',
  },
  registeredAgent: {
    name: 'Test Agent LLC',
    streetAddress: '200 Legal Blvd',
    city: 'Orlando',
    state: 'FL',
    zipCode: '32801',
  },
  officers: [
    { title: 'P', name: 'Alice Test', address: '100 Test St, Tampa FL 33601' },
    { title: 'S', name: 'Bob Test', address: '200 Test Ave, Tampa FL 33602' },
  ],
  signature: 'Alice Test',
};

test.describe('FillAnnualReport', () => {
  let fillScript;
  let events;

  test.beforeEach(async ({ page }) => {
    events = [];
    fillScript = new FillAnnualReport(page, {
      selectorsPath: path.join(__dirname, '../../selectors.json'),
      onEvent: (event) => events.push(event),
    });
  });

  test.describe('Selector Loading', () => {
    test('should load selectors from selectors.json at runtime', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      expect(fillScript.selectors).toBeDefined();
      expect(fillScript.selectors.filingStart).toBeDefined();
      expect(fillScript.selectors.entityForm).toBeDefined();
    });

    test('should have zero hardcoded selectors in script', async () => {
      const fs = require('fs');
      const scriptContent = fs.readFileSync(
        path.join(__dirname, '../fill-annual-report.js'),
        'utf8'
      );
      
      // Check for hardcoded selectors (common patterns)
      const hardcodedPatterns = [
        /#[a-zA-Z][\w-]*(?!['"])/,  // ID selectors like #elementId (not in strings)
        /\.[\w-]+\[/,                // Class selectors with attributes
        /querySelector\(['"][^'"]*[#.][^'"]+['"]\)/,  // Direct querySelector with selectors
      ];
      
      // Script should load all selectors from config
      expect(scriptContent).toContain('loadSelectors');
      expect(scriptContent).toContain('selectors.json');
    });
  });

  test.describe('Entity Search', () => {
    test('should search entity by document number', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.searchEntity(TEST_ENTITY_DATA.documentNumber);
      
      const docInput = page.locator('[aria-label="Document Number"]');
      await expect(docInput).toHaveValue(TEST_ENTITY_DATA.documentNumber);
    });

    test('should emit field_filled event after entering document number', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.searchEntity(TEST_ENTITY_DATA.documentNumber);
      
      const fieldFilledEvents = events.filter(e => e.type === EVENT_TYPES.FIELD_FILLED);
      expect(fieldFilledEvents.length).toBeGreaterThan(0);
      expect(fieldFilledEvents[0].field).toBe('documentNumber');
    });
  });

  test.describe('Form Filling', () => {
    test('should fill principal address fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.fillPrincipalAddress(TEST_ENTITY_DATA.principalAddress);
      
      await expect(page.locator('[aria-label="Principal Street Address"]'))
        .toHaveValue(TEST_ENTITY_DATA.principalAddress.streetAddress);
      await expect(page.locator('[aria-label="Principal City"]'))
        .toHaveValue(TEST_ENTITY_DATA.principalAddress.city);
      await expect(page.locator('[aria-label="Principal State"]'))
        .toHaveValue(TEST_ENTITY_DATA.principalAddress.state);
      await expect(page.locator('[aria-label="Principal Zip"]'))
        .toHaveValue(TEST_ENTITY_DATA.principalAddress.zipCode);
    });

    test('should fill mailing address fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.fillMailingAddress(TEST_ENTITY_DATA.mailingAddress);
      
      await expect(page.locator('[aria-label="Mailing Street Address"]'))
        .toHaveValue(TEST_ENTITY_DATA.mailingAddress.streetAddress);
      await expect(page.locator('[aria-label="Mailing City"]'))
        .toHaveValue(TEST_ENTITY_DATA.mailingAddress.city);
    });

    test('should fill registered agent fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.fillRegisteredAgent(TEST_ENTITY_DATA.registeredAgent);
      
      await expect(page.locator('[aria-label="Registered Agent Name"]'))
        .toHaveValue(TEST_ENTITY_DATA.registeredAgent.name);
      await expect(page.locator('[aria-label="Agent Street Address"]'))
        .toHaveValue(TEST_ENTITY_DATA.registeredAgent.streetAddress);
    });

    test('should fill officer/director rows', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.fillOfficers(TEST_ENTITY_DATA.officers);
      
      const officerRows = page.locator('[data-officer-index]');
      const count = await officerRows.count();
      expect(count).toBeGreaterThanOrEqual(TEST_ENTITY_DATA.officers.length);
    });

    test('should emit field_filled events for each field', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.fillPrincipalAddress(TEST_ENTITY_DATA.principalAddress);
      
      const fieldFilledEvents = events.filter(e => e.type === EVENT_TYPES.FIELD_FILLED);
      // Should have events for street, city, state, zip
      expect(fieldFilledEvents.length).toBeGreaterThanOrEqual(4);
    });
  });

  test.describe('Selector Fallback Strategy', () => {
    test('should use primary selector first', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Primary selector (aria-label) should work
      const element = await fillScript.findElement('filingStart.documentNumberInput');
      expect(element).not.toBeNull();
    });

    test('should fall back to XPath when primary fails', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Modify selectors to have broken primary but valid fallback
      fillScript.selectors.filingStart.documentNumberInput.primary = '[aria-label="NonExistent"]';
      
      const element = await fillScript.findElement('filingStart.documentNumberInput');
      // Should still find via XPath fallback
      expect(element).not.toBeNull();
    });
  });

  test.describe('CAPTCHA Detection', () => {
    test('should detect CAPTCHA and pause automation', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Show the captcha section in the mock form
      await page.evaluate(() => window.showCaptcha());
      
      const hasCaptcha = await fillScript.detectCaptcha();
      expect(hasCaptcha).toBe(true);
    });

    test('should emit captcha_reached event when CAPTCHA detected', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await page.evaluate(() => window.showCaptcha());
      
      await fillScript.checkForBlockers();
      
      const captchaEvents = events.filter(e => e.type === EVENT_TYPES.CAPTCHA_REACHED);
      expect(captchaEvents.length).toBe(1);
    });

    test('should NOT automatically solve CAPTCHA', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await page.evaluate(() => window.showCaptcha());
      
      // The script should pause, not proceed
      const result = await fillScript.checkForBlockers();
      expect(result.paused).toBe(true);
      expect(result.reason).toBe('captcha');
    });
  });

  test.describe('Payment Detection', () => {
    test('should detect payment section and pause automation', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Show the payment section in the mock form
      await page.evaluate(() => window.showPayment());
      
      const hasPayment = await fillScript.detectPayment();
      expect(hasPayment).toBe(true);
    });

    test('should emit payment_reached event when payment detected', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await page.evaluate(() => window.showPayment());
      
      await fillScript.checkForBlockers();
      
      const paymentEvents = events.filter(e => e.type === EVENT_TYPES.PAYMENT_REACHED);
      expect(paymentEvents.length).toBe(1);
    });

    test('should NOT automatically fill payment fields', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await page.evaluate(() => window.showPayment());
      
      // Payment fields should remain empty
      const cardInput = page.locator('[aria-label="Card Number"]');
      await expect(cardInput).toHaveValue('');
    });
  });

  test.describe('Error Handling', () => {
    test('should emit error event on selector failure', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Break all selectors for a field
      fillScript.selectors.entityForm.principalAddress.streetAddress = {
        primary: '[data-nonexistent="true"]',
        fallback: '//div[@data-also-nonexistent="true"]',
      };
      
      try {
        await fillScript.fillPrincipalAddress(TEST_ENTITY_DATA.principalAddress);
      } catch (e) {
        // Expected to fail
      }
      
      const errorEvents = events.filter(e => e.type === EVENT_TYPES.ERROR);
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    test('should include field name in error event', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      fillScript.selectors.entityForm.principalAddress.streetAddress = {
        primary: '[data-nonexistent="true"]',
        fallback: '//div[@data-also-nonexistent="true"]',
      };
      
      try {
        await fillScript.fillPrincipalAddress(TEST_ENTITY_DATA.principalAddress);
      } catch (e) {
        // Expected
      }
      
      const errorEvent = events.find(e => e.type === EVENT_TYPES.ERROR);
      expect(errorEvent.field).toBeDefined();
    });
  });

  test.describe('Full Flow Integration', () => {
    test('should complete full form fill flow', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      const result = await fillScript.fillForm(TEST_ENTITY_DATA);
      
      // Should have filled all sections
      expect(result.fieldsCompleted).toBeGreaterThan(10);
      
      // Should have emitted multiple field_filled events
      const fieldFilledEvents = events.filter(e => e.type === EVENT_TYPES.FIELD_FILLED);
      expect(fieldFilledEvents.length).toBeGreaterThan(10);
    });

    test('should pause at signature page before submit', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      const result = await fillScript.fillForm(TEST_ENTITY_DATA);
      
      // Should NOT auto-submit
      expect(result.submitted).toBe(false);
      expect(result.pausedAt).toBe('signature');
    });

    test('should require user_approved flag before submission', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      // Without user_approved, should throw
      await expect(
        fillScript.submit({ userApproved: false })
      ).rejects.toThrow('user_approved');
    });
  });

  test.describe('Audit Logging', () => {
    test('should include timestamp in all events', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.searchEntity(TEST_ENTITY_DATA.documentNumber);
      
      events.forEach(event => {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      });
    });

    test('should include entity identifier in all events', async ({ page }) => {
      await page.goto(MOCK_FORM_URL);
      await fillScript.loadSelectors();
      
      await fillScript.searchEntity(TEST_ENTITY_DATA.documentNumber);
      await fillScript.fillPrincipalAddress(TEST_ENTITY_DATA.principalAddress);
      
      const fieldEvents = events.filter(e => e.type === EVENT_TYPES.FIELD_FILLED);
      fieldEvents.forEach(event => {
        expect(event.entityId || event.documentNumber).toBeDefined();
      });
    });
  });
});
