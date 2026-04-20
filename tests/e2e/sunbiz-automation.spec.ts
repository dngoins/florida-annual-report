import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E Tests for Sunbiz Automation Flow
 * 
 * These tests use a mock HTML fixture to test the Playwright automation
 * flow without hitting the live Sunbiz site.
 * 
 * Acceptance Criteria:
 * - Entity search
 * - Field filling
 * - CAPTCHA pause event fires correctly
 * - Payment pause event fires correctly
 * - Selectors read from selectors.json (not hardcoded)
 */

// Load selectors from configuration file
const selectorsPath = path.resolve(__dirname, '../../integrations/sunbiz/selectors.json');
const selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf-8'));

// Helper to get fixture URL
function getFixtureUrl(): string {
  const fixturePath = path.resolve(__dirname, 'fixtures/sunbiz-mock.html');
  return `file://${fixturePath}`;
}

// Helper to wait for custom event
async function waitForCustomEvent(page: Page, eventName: string, timeout = 5000): Promise<any> {
  return page.evaluate((name) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${name}`)), 5000);
      window.addEventListener(name, (e: CustomEvent) => {
        clearTimeout(timer);
        resolve(e.detail);
      }, { once: true });
    });
  }, eventName);
}

test.describe('Selector Configuration', () => {
  test('should load selectors from selectors.json file', () => {
    expect(selectors).toBeDefined();
    expect(selectors.version).toBe('1.0.0');
    expect(selectors.filingStart).toBeDefined();
    expect(selectors.entityForm).toBeDefined();
    expect(selectors.captchaDetection).toBeDefined();
    expect(selectors.paymentDetection).toBeDefined();
  });

  test('selectors should have primary and fallback strategies', () => {
    // Document number input
    const docNumSelector = selectors.filingStart.documentNumberInput;
    expect(docNumSelector.primary).toBeDefined();
    expect(docNumSelector.fallback).toBeDefined();
    
    // Principal address
    const principalStreet = selectors.entityForm.principalAddress.streetAddress;
    expect(principalStreet.primary).toBeDefined();
    expect(principalStreet.fallback).toBeDefined();
    
    // CAPTCHA indicators
    expect(selectors.captchaDetection.indicators).toBeInstanceOf(Array);
    expect(selectors.captchaDetection.indicators.length).toBeGreaterThan(0);
  });

  test('selectors should use label-based matching as primary strategy', () => {
    // Check that primary selectors use aria-label or label matching
    const docNumSelector = selectors.filingStart.documentNumberInput.primary;
    expect(docNumSelector).toContain('aria-label');
    
    const signatureSelector = selectors.signaturePage.signatureInput.primary;
    expect(signatureSelector).toContain('aria-label');
  });
});

test.describe('Entity Search', () => {
  test('should display document number input field', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Use selector from config (primary)
    const docInput = page.locator(selectors.filingStart.documentNumberInput.primary);
    await expect(docInput).toBeVisible();
    await expect(docInput).toHaveAttribute('aria-label', 'Document Number');
  });

  test('should search for entity by document number', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Fill document number using selector from config
    const docInput = page.locator(selectors.filingStart.documentNumberInput.primary);
    await docInput.fill('P12345678');
    
    // Click continue button using selector from config
    const continueBtn = page.locator(selectors.filingStart.continueButton.primary);
    await continueBtn.click();
    
    // Verify search results are displayed
    await expect(page.locator('#searchResults')).toBeVisible();
    await expect(page.locator('#displayDocNum')).toHaveText('P12345678');
  });

  test('should show validation error for invalid document number', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Enter invalid document number
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'invalid');
    await page.click(selectors.filingStart.continueButton.primary);
    
    // Verify error is shown
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test('should dispatch entityFound event on successful search', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Set up event listener before triggering search
    const eventPromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('sunbiz:entityFound', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Perform search
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    
    // Wait for event
    const eventDetail = await eventPromise;
    expect(eventDetail.documentNumber).toBe('P12345678');
    expect(eventDetail.entityName).toBe('TEST CORPORATION INC.');
    expect(eventDetail.status).toBe('ACTIVE');
  });
});

test.describe('Field Filling - Principal Address', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to entity form
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
  });

  test('should fill principal street address', async ({ page }) => {
    const streetInput = page.locator(selectors.entityForm.principalAddress.streetAddress.primary);
    await streetInput.fill('123 Main Street');
    await expect(streetInput).toHaveValue('123 Main Street');
  });

  test('should fill principal city', async ({ page }) => {
    const cityInput = page.locator(selectors.entityForm.principalAddress.city.primary);
    await cityInput.fill('Miami');
    await expect(cityInput).toHaveValue('Miami');
  });

  test('should select principal state', async ({ page }) => {
    const stateSelect = page.locator(selectors.entityForm.principalAddress.state.primary);
    await stateSelect.selectOption('FL');
    await expect(stateSelect).toHaveValue('FL');
  });

  test('should fill principal zip code', async ({ page }) => {
    const zipInput = page.locator(selectors.entityForm.principalAddress.zipCode.primary);
    await zipInput.fill('33101');
    await expect(zipInput).toHaveValue('33101');
  });
});

test.describe('Field Filling - Mailing Address', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getFixtureUrl());
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
  });

  test('should fill mailing street address', async ({ page }) => {
    const streetInput = page.locator(selectors.entityForm.mailingAddress.streetAddress.primary);
    await streetInput.fill('456 Oak Avenue');
    await expect(streetInput).toHaveValue('456 Oak Avenue');
  });

  test('should copy principal address to mailing when checkbox is clicked', async ({ page }) => {
    // Fill principal address
    await page.fill(selectors.entityForm.principalAddress.streetAddress.primary, '123 Main St');
    await page.fill(selectors.entityForm.principalAddress.city.primary, 'Miami');
    await page.selectOption(selectors.entityForm.principalAddress.state.primary, 'FL');
    await page.fill(selectors.entityForm.principalAddress.zipCode.primary, '33101');
    
    // Click "Same as Principal"
    await page.check('#sameAsAbove');
    
    // Verify mailing address copied
    await expect(page.locator(selectors.entityForm.mailingAddress.streetAddress.primary)).toHaveValue('123 Main St');
    await expect(page.locator(selectors.entityForm.mailingAddress.city.primary)).toHaveValue('Miami');
    await expect(page.locator(selectors.entityForm.mailingAddress.state.primary)).toHaveValue('FL');
    await expect(page.locator(selectors.entityForm.mailingAddress.zipCode.primary)).toHaveValue('33101');
  });
});

test.describe('Field Filling - Registered Agent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to registered agent step
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
  });

  test('should fill registered agent name', async ({ page }) => {
    const nameInput = page.locator(selectors.entityForm.registeredAgent.name.primary);
    await nameInput.fill('John Smith, Registered Agent');
    await expect(nameInput).toHaveValue('John Smith, Registered Agent');
  });

  test('should fill registered agent address', async ({ page }) => {
    await page.fill(selectors.entityForm.registeredAgent.streetAddress.primary, '789 Legal Way');
    await page.fill(selectors.entityForm.registeredAgent.city.primary, 'Tampa');
    await page.selectOption(selectors.entityForm.registeredAgent.state.primary, 'FL');
    await page.fill(selectors.entityForm.registeredAgent.zipCode.primary, '33602');
    
    await expect(page.locator(selectors.entityForm.registeredAgent.streetAddress.primary)).toHaveValue('789 Legal Way');
    await expect(page.locator(selectors.entityForm.registeredAgent.city.primary)).toHaveValue('Tampa');
    await expect(page.locator(selectors.entityForm.registeredAgent.state.primary)).toHaveValue('FL');
    await expect(page.locator(selectors.entityForm.registeredAgent.zipCode.primary)).toHaveValue('33602');
  });
});

test.describe('Field Filling - Officers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to officers step
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
  });

  test('should find officers section using selector', async ({ page }) => {
    const officersSection = page.locator(selectors.entityForm.officers.container.primary);
    await expect(officersSection).toBeVisible();
  });

  test('should fill first officer information', async ({ page }) => {
    // Use officer row selectors
    await page.selectOption(selectors.entityForm.officers.officerRow.title.primary, 'CEO');
    await page.fill(selectors.entityForm.officers.officerRow.name.primary, 'Jane Doe');
    await page.fill(selectors.entityForm.officers.officerRow.address.primary, '100 Executive Blvd, Miami, FL 33101');
    
    await expect(page.locator(selectors.entityForm.officers.officerRow.title.primary).first()).toHaveValue('CEO');
    await expect(page.locator(selectors.entityForm.officers.officerRow.name.primary).first()).toHaveValue('Jane Doe');
  });

  test('should add additional officer', async ({ page }) => {
    const addButton = page.locator(selectors.entityForm.officers.addOfficerButton.primary);
    await addButton.click();
    
    // Should now have 2 officer rows
    const officerRows = page.locator('.officer-row');
    await expect(officerRows).toHaveCount(2);
  });
});

test.describe('Review and Signature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate through to signature step
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    
    // Fill required fields
    await page.fill(selectors.entityForm.principalAddress.streetAddress.primary, '123 Main St');
    await page.fill(selectors.entityForm.principalAddress.city.primary, 'Miami');
    await page.selectOption(selectors.entityForm.principalAddress.state.primary, 'FL');
    await page.fill(selectors.entityForm.principalAddress.zipCode.primary, '33101');
    
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click(selectors.reviewPage.continueButton.primary);
  });

  test('should display signature input', async ({ page }) => {
    const signatureInput = page.locator(selectors.signaturePage.signatureInput.primary);
    await expect(signatureInput).toBeVisible();
  });

  test('should fill signature', async ({ page }) => {
    const signatureInput = page.locator(selectors.signaturePage.signatureInput.primary);
    await signatureInput.fill('John Doe');
    await expect(signatureInput).toHaveValue('John Doe');
  });

  test('should check certification checkbox', async ({ page }) => {
    const certCheckbox = page.locator(selectors.signaturePage.certificationCheckbox.primary);
    await certCheckbox.check();
    await expect(certCheckbox).toBeChecked();
  });
});

test.describe('CAPTCHA Pause Event', () => {
  test('should detect CAPTCHA elements using configured selectors', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to signature page where CAPTCHA is shown
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click(selectors.reviewPage.continueButton.primary);
    
    // Check CAPTCHA detection using selectors from config
    let captchaFound = false;
    for (const indicator of selectors.captchaDetection.indicators) {
      const element = page.locator(indicator);
      const count = await element.count();
      if (count > 0) {
        captchaFound = true;
        break;
      }
    }
    expect(captchaFound).toBe(true);
  });

  test('should fire CAPTCHA pause event with correct payload', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to signature page
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click(selectors.reviewPage.continueButton.primary);
    
    // Set up event listener
    const eventPromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('sunbiz:captchaPause', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Simulate CAPTCHA solve (which fires the pause event)
    await page.click('button:has-text("Simulate CAPTCHA Solve")');
    
    // Verify event payload
    const eventDetail = await eventPromise;
    expect(eventDetail).toHaveProperty('type');
    expect(eventDetail).toHaveProperty('requiresHumanIntervention', true);
    expect(eventDetail).toHaveProperty('step', 6);
  });

  test('submit button should be disabled until CAPTCHA is solved', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to signature page
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click(selectors.reviewPage.continueButton.primary);
    
    // Submit button should be disabled
    const submitButton = page.locator('#submitButton');
    await expect(submitButton).toBeDisabled();
    
    // Solve CAPTCHA
    await page.click('button:has-text("Simulate CAPTCHA Solve")');
    
    // Submit button should now be enabled
    await expect(submitButton).toBeEnabled();
  });
});

test.describe('Payment Pause Event', () => {
  test('should detect payment page using configured selectors', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate directly to payment step
    await page.evaluate(() => {
      (window as any).sunbizMock.goToStep(7);
    });
    
    // Check payment detection using selectors from config
    let paymentFound = false;
    for (const indicator of selectors.paymentDetection.indicators) {
      // Skip XPath selectors for this test (Playwright handles them differently)
      if (indicator.startsWith('//')) continue;
      
      const element = page.locator(indicator);
      const count = await element.count();
      if (count > 0) {
        paymentFound = true;
        break;
      }
    }
    expect(paymentFound).toBe(true);
  });

  test('should fire payment pause event with amount', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to payment step
    await page.evaluate(() => {
      (window as any).sunbizMock.goToStep(7);
    });
    
    // Set up event listener
    const eventPromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('sunbiz:paymentPause', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Trigger payment
    await page.click('button:has-text("Pay $138.75")');
    
    // Verify event payload
    const eventDetail = await eventPromise;
    expect(eventDetail).toHaveProperty('amount', 138.75);
    expect(eventDetail).toHaveProperty('currency', 'USD');
    expect(eventDetail).toHaveProperty('requiresHumanIntervention', true);
    expect(eventDetail).toHaveProperty('step', 7);
  });

  test('should display credit card input fields', async ({ page }) => {
    await page.goto(getFixtureUrl());
    await page.evaluate(() => {
      (window as any).sunbizMock.goToStep(7);
    });
    
    // Check for card number field
    const cardInput = page.locator("input[aria-label='Card Number']");
    await expect(cardInput).toBeVisible();
    
    // Check for expiry field
    const expiryInput = page.locator("input[aria-label='Credit Card Expiration']");
    await expect(expiryInput).toBeVisible();
    
    // Check for CVV field
    const cvvInput = page.locator("input[aria-label='Credit Card CVV']");
    await expect(cvvInput).toBeVisible();
  });
});

test.describe('Confirmation Page', () => {
  test('should display confirmation number after successful filing', async ({ page }) => {
    await page.goto(getFixtureUrl());
    // Navigate to confirmation step
    await page.evaluate(() => {
      (window as any).sunbizMock.goToStep(8);
    });
    
    // Check confirmation number using selector from config
    const confNumber = page.locator(selectors.confirmationPage.confirmationNumber.primary);
    await expect(confNumber).toBeVisible();
    
    // Verify format (AR2026-XXXXXXXXX)
    const text = await confNumber.textContent();
    expect(text).toMatch(/^AR2026-\d{9}$/);
  });

  test('should fire filing complete event', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Navigate to payment step
    await page.evaluate(() => {
      (window as any).sunbizMock.goToStep(7);
    });
    
    // Set up event listener for completion
    const eventPromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('sunbiz:filingComplete', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Process payment (this navigates to confirmation)
    await page.click('button:has-text("Pay $138.75")');
    
    // Wait for event
    const eventDetail = await eventPromise;
    expect(eventDetail).toHaveProperty('confirmationNumber');
    expect(eventDetail.confirmationNumber).toMatch(/^AR2026-\d{9}$/);
    expect(eventDetail).toHaveProperty('timestamp');
  });
});

test.describe('Navigation Flow', () => {
  test('should navigate back from entity form to search', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Go to entity form
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    
    // Click back
    await page.click('button:has-text("Back")');
    
    // Should be back at search step
    await expect(page.locator('#step1')).toHaveClass(/active/);
  });

  test('should dispatch navigation events', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Set up event listener
    const eventPromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('sunbiz:navigation', (e: CustomEvent) => {
          resolve(e.detail);
        }, { once: true });
      });
    });
    
    // Navigate to step 2
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    
    // Wait for event
    const eventDetail = await eventPromise;
    expect(eventDetail).toHaveProperty('step', 2);
    expect(eventDetail).toHaveProperty('stepName', 'entity-form');
  });

  test('review page edit button should navigate back to correct step', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Navigate to review page
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Continue")');
    
    // Click edit for registered agent
    await page.click(selectors.reviewPage.editButton.primary + ':nth-of-type(4)');
    
    // Should navigate back to agent step
    await expect(page.locator('#step3')).toHaveClass(/active/);
  });
});

test.describe('Full Flow Integration', () => {
  test('should complete full flow from search to CAPTCHA pause', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Step 1: Search
    await page.fill(selectors.filingStart.documentNumberInput.primary, 'P12345678');
    await page.click(selectors.filingStart.continueButton.primary);
    await page.click('button:has-text("Continue to Filing")');
    
    // Step 2: Principal Address
    await page.fill(selectors.entityForm.principalAddress.streetAddress.primary, '123 Main Street');
    await page.fill(selectors.entityForm.principalAddress.city.primary, 'Miami');
    await page.selectOption(selectors.entityForm.principalAddress.state.primary, 'FL');
    await page.fill(selectors.entityForm.principalAddress.zipCode.primary, '33101');
    await page.click('button:has-text("Continue")');
    
    // Step 3: Registered Agent
    await page.fill(selectors.entityForm.registeredAgent.name.primary, 'John Smith');
    await page.fill(selectors.entityForm.registeredAgent.streetAddress.primary, '456 Oak Ave');
    await page.fill(selectors.entityForm.registeredAgent.city.primary, 'Tampa');
    await page.selectOption(selectors.entityForm.registeredAgent.state.primary, 'FL');
    await page.fill(selectors.entityForm.registeredAgent.zipCode.primary, '33602');
    await page.click('button:has-text("Continue")');
    
    // Step 4: Officers
    await page.selectOption(selectors.entityForm.officers.officerRow.title.primary, 'President');
    await page.fill(selectors.entityForm.officers.officerRow.name.primary, 'Jane Doe');
    await page.fill(selectors.entityForm.officers.officerRow.address.primary, '789 Legal Way, Miami, FL');
    await page.click('button:has-text("Continue")');
    
    // Step 5: Review
    await expect(page.locator('#reviewPrincipalAddress')).toContainText('123 Main Street');
    await expect(page.locator('#reviewAgent')).toContainText('John Smith');
    await page.click(selectors.reviewPage.continueButton.primary);
    
    // Step 6: Signature & CAPTCHA
    await page.fill(selectors.signaturePage.signatureInput.primary, 'Jane Doe');
    await page.check(selectors.signaturePage.certificationCheckbox.primary);
    
    // Verify CAPTCHA pause point
    const submitButton = page.locator('#submitButton');
    await expect(submitButton).toBeDisabled();
    
    // CAPTCHA must be solved before proceeding
    await page.click('button:has-text("Simulate CAPTCHA Solve")');
    await expect(submitButton).toBeEnabled();
  });
});

test.describe('Error Handling', () => {
  test('should detect validation errors using configured selectors', async ({ page }) => {
    await page.goto(getFixtureUrl());
    
    // Try to submit without document number
    await page.click(selectors.filingStart.continueButton.primary);
    
    // Check for validation error using selector pattern from config
    const errorSelectors = selectors.errorIndicators.validationErrors;
    let errorFound = false;
    
    for (const selector of errorSelectors) {
      if (selector.startsWith('//')) continue; // Skip XPath
      const element = page.locator(selector);
      const count = await element.count();
      if (count > 0 && await element.first().isVisible()) {
        errorFound = true;
        break;
      }
    }
    
    expect(errorFound).toBe(true);
  });
});
