# Sunbiz Automation Scripts

Playwright automation scripts for Florida Annual Report filing on Sunbiz.org.

## Overview

These scripts automate form filling while adhering to the platform's core principles:

- **Human-in-the-Loop**: Pauses at CAPTCHA and payment for manual completion
- **Selector Resilience**: All selectors loaded from `selectors.json` (zero hardcoded)
- **Audit Logging**: Emits structured events for every action
- **User Approval Required**: Submission requires explicit `user_approved: true` flag

## Files

| File | Description |
|------|-------------|
| `fill-annual-report.js` | Main automation: search entity, fill all fields, pause at CAPTCHA/payment |
| `verify-prefilled.js` | Verify Sunbiz pre-filled values match reconciliation data |
| `index.js` | Module entry point |
| `tests/` | Integration tests with mock HTML fixtures |

## Quick Start

```javascript
const { chromium } = require('playwright');
const { createWorkflow, EVENT_TYPES } = require('./integrations/sunbiz/scripts');

async function automateFilig(entityData) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Create workflow with event logging
  const workflow = createWorkflow(page, {
    onEvent: (event) => {
      console.log(`[${event.type}]`, event);
      // Send to audit log service
    }
  });
  
  // Load selectors
  await workflow.loadSelectors();
  
  // Navigate to Sunbiz
  await page.goto('https://services.sunbiz.org/Filings/AnnualReport/FilingStart');
  
  // Verify pre-filled values (optional)
  const verification = await workflow.verifyPrefilled(reconciliationData);
  if (!verification.match) {
    console.log('Discrepancies found:', verification.discrepancies);
  }
  
  // Fill the form
  const result = await workflow.fillForm(entityData);
  console.log(`Filled ${result.fieldsCompleted} fields`);
  
  // ⚠️ Automation pauses here - User must:
  // 1. Complete CAPTCHA (if present)
  // 2. Complete payment
  // 3. Confirm submission
  
  // After user confirmation (user_approved comes from UI)
  if (userApproved) {
    await workflow.submit({ userApproved: true });
    const confirmation = await workflow.captureConfirmation();
    console.log('Confirmation:', confirmation.confirmationNumber);
  }
  
  await browser.close();
}
```

## Entity Data Format

```javascript
const entityData = {
  documentNumber: 'P12345678',
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
  signature: 'Jane Doe',
};
```

## Event Types

The scripts emit structured events for audit logging:

| Event | Description |
|-------|-------------|
| `field_filled` | A form field was populated |
| `captcha_reached` | CAPTCHA detected - automation paused |
| `payment_reached` | Payment section detected - automation paused |
| `error` | An error occurred |
| `navigation` | Page navigation occurred |
| `selector_fallback` | Primary selector failed, used fallback |
| `form_complete` | All fields filled, awaiting user action |
| `submission_blocked` | Submission blocked (missing user_approved) |
| `verification_passed` | Pre-filled values match reconciliation data |
| `verification_failed` | Discrepancies found |
| `review_required` | Confidence below threshold (0.75) |

## Selector Strategy

Selectors are loaded from `../selectors.json` with the following priority:

1. **Primary**: Label-based matching (`aria-label`, visible label text)
2. **Fallback**: XPath expressions
3. **Label Match**: Playwright's `getByLabel()` helper

This ensures resilience when Sunbiz updates their form structure.

## Testing

```bash
# Run all tests
npx playwright test --config=tests/playwright.config.js

# Run with UI
npx playwright test --config=tests/playwright.config.js --ui

# Run specific test file
npx playwright test tests/fill-annual-report.test.js
```

Tests use mock HTML fixtures (`tests/fixtures/`) to avoid hitting live Sunbiz.

## Constitution Compliance

These scripts adhere to the following constitutional principles:

- **Principle II (Human-in-the-Loop)**: Never automates CAPTCHA or payment; requires `user_approved` for submission
- **Principle III (Fail-Safe)**: All errors emitted as events; retry with exponential backoff
- **Principle IV (Audit Immutability)**: Every action emits a timestamped event
- **Principle V (Selector Resilience)**: Zero hardcoded selectors; all from `selectors.json`

## Confidence Threshold

The verification script uses a confidence threshold (default: 0.75) to flag results for human review:

```javascript
const verifyScript = new VerifyPrefilled(page, {
  confidenceThreshold: 0.80,  // Stricter threshold
  onEvent: handleEvent,
});
```

Results with confidence below the threshold emit a `review_required` event and set `requiresReview: true` in the result.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Selector not found | Tries fallback, then label match; emits `error` event if all fail |
| Network timeout | Caller should implement retry with exponential backoff |
| CAPTCHA detected | Emits `captcha_reached`, returns `{ paused: true, reason: 'captcha' }` |
| Payment detected | Emits `payment_reached`, returns `{ paused: true, reason: 'payment' }` |
| Missing user_approved | Throws error, emits `submission_blocked` |

## Dependencies

- `playwright` or `@playwright/test` - Browser automation
- Node.js 18+ (uses modern JS features)
