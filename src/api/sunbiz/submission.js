/**
 * Sunbiz submission orchestrator.
 *
 * Drives the end-to-end Sunbiz Annual Report filing lifecycle. Wraps
 * the existing FillAnnualReport Playwright class (integrations/sunbiz/scripts)
 * and adds:
 *
 *   - in-memory submission registry (id → live session state)
 *   - structured event log streamed to the UI (Server-Sent Events)
 *   - pause/resume coordination for CAPTCHA and payment
 *   - mock mode (default) so the demo stack works without a browser
 *
 * Two engines:
 *   - mock   (default; set SUBMIT_MOCK=1 or leave unset): emits the full
 *            event sequence with realistic delays, includes CAPTCHA + payment
 *            pause/resume cycles, and ends with a fake confirmation number.
 *   - live   (SUBMIT_MOCK=0): launches Playwright (requires @playwright/test
 *            and a Chromium runtime to be installed). The browser opens
 *            headed so the human can complete CAPTCHA + payment manually,
 *            then resume from the UI.
 *
 * The submission registry is intentionally in-process: it survives the
 * lifetime of one Next.js / Express server. For production, swap it for
 * a queue + persistent store (Redis, Postgres). Per CONSTITUTION.md the
 * registry MUST audit-log every transition.
 *
 * @module sunbiz/submission
 */

const { randomUUID } = require('crypto');

const STATES = Object.freeze({
  CREATED: 'created',
  RUNNING: 'running',
  AWAITING_CAPTCHA: 'awaiting_captcha',
  AWAITING_PAYMENT: 'awaiting_payment',
  SUBMITTING: 'submitting',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
});

const EVENT_TYPES = Object.freeze({
  CREATED: 'submission_created',
  NAVIGATION: 'navigation',
  FIELD_FILLED: 'field_filled',
  CAPTCHA_REACHED: 'captcha_reached',
  PAYMENT_REACHED: 'payment_reached',
  RESUMED: 'resumed',
  FORM_COMPLETE: 'form_complete',
  SUBMITTING: 'submitting',
  CONFIRMED: 'confirmed',
  ERROR: 'error',
  AUDIT: 'audit',
});

// In-memory submission store. Keyed by submission_id.
const submissions = new Map();

function getEngine() {
  return process.env.SUBMIT_MOCK === '0' ? 'live' : 'mock';
}

/**
 * @typedef {Object} Submission
 * @property {string} id
 * @property {string} state
 * @property {string} engine          - 'mock' | 'live'
 * @property {string} createdAt
 * @property {Object} entityData       - normalized data passed in
 * @property {string|null} confirmationNumber
 * @property {Array<{type:string,timestamp:string,[k:string]:any}>} events
 * @property {Array<(event:Object)=>void>} listeners
 * @property {Function|null} resumeContinuation
 * @property {Function} _emit
 * @property {Function} _setState
 */

function createSubmission(entityData) {
  const id = `sub_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const sub = {
    id,
    state: STATES.CREATED,
    engine: getEngine(),
    createdAt: new Date().toISOString(),
    entityData,
    confirmationNumber: null,
    events: [],
    listeners: [],
    resumeContinuation: null,
  };
  sub._emit = function (type, data = {}) {
    const ev = { type, timestamp: new Date().toISOString(), ...data };
    this.events.push(ev);
    for (const l of this.listeners) {
      try { l(ev); } catch (e) { /* deaf listener */ }
    }
    return ev;
  };
  sub._setState = function (state, data = {}) {
    this.state = state;
    this._emit(EVENT_TYPES.AUDIT, { state, ...data });
  };
  submissions.set(id, sub);
  sub._emit(EVENT_TYPES.CREATED, { id, engine: sub.engine });
  return sub;
}

function getSubmission(id) {
  return submissions.get(id) || null;
}

function subscribe(id, listener) {
  const sub = submissions.get(id);
  if (!sub) return () => {};
  sub.listeners.push(listener);
  // Replay any events that already happened so late subscribers don't miss
  // the start of the lifecycle.
  for (const ev of sub.events) {
    try { listener(ev); } catch (e) { /* ignore */ }
  }
  return () => {
    sub.listeners = sub.listeners.filter((l) => l !== listener);
  };
}

function resume(id) {
  const sub = submissions.get(id);
  if (!sub) return { ok: false, error: 'submission not found' };
  if (!sub.resumeContinuation) {
    return { ok: false, error: `submission is in state ${sub.state}; nothing to resume` };
  }
  const cont = sub.resumeContinuation;
  sub.resumeContinuation = null;
  sub._emit(EVENT_TYPES.RESUMED, { from: sub.state });
  cont();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mock engine — simulates the full Sunbiz lifecycle with realistic delays
// so the UI/event-stream wiring can be developed and demoed end-to-end
// without Playwright or a real browser.
// ---------------------------------------------------------------------------

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runMockSubmission(sub) {
  const data = sub.entityData;
  sub._setState(STATES.RUNNING);
  sub._emit(EVENT_TYPES.NAVIGATION, {
    action: 'navigate',
    url: 'https://services.sunbiz.org/Filings/AnnualReport/FilingStart',
  });
  await wait(400);

  sub._emit(EVENT_TYPES.FIELD_FILLED, {
    field: 'documentNumber',
    value: data.documentNumber || '(none)',
  });
  await wait(300);

  sub._emit(EVENT_TYPES.NAVIGATION, { action: 'continue_to_form' });
  await wait(500);

  const fillField = async (field, value) => {
    sub._emit(EVENT_TYPES.FIELD_FILLED, {
      field,
      value: String(value || '').slice(0, 60),
    });
    await wait(120);
  };

  if (data.principalAddress) {
    await fillField('principalAddress.streetAddress', data.principalAddress.streetAddress);
    await fillField('principalAddress.city', data.principalAddress.city);
    await fillField('principalAddress.state', data.principalAddress.state);
    await fillField('principalAddress.zipCode', data.principalAddress.zipCode);
  }
  if (data.mailingAddress) {
    await fillField('mailingAddress.streetAddress', data.mailingAddress.streetAddress);
    await fillField('mailingAddress.city', data.mailingAddress.city);
    await fillField('mailingAddress.state', data.mailingAddress.state);
    await fillField('mailingAddress.zipCode', data.mailingAddress.zipCode);
  }
  if (data.registeredAgent) {
    await fillField('registeredAgent.name', data.registeredAgent.name);
    await fillField('registeredAgent.streetAddress', data.registeredAgent.streetAddress);
    await fillField('registeredAgent.city', data.registeredAgent.city);
    await fillField('registeredAgent.state', data.registeredAgent.state);
    await fillField('registeredAgent.zipCode', data.registeredAgent.zipCode);
  }
  if (Array.isArray(data.officers)) {
    for (let i = 0; i < data.officers.length; i++) {
      const o = data.officers[i];
      await fillField(`officers[${i}].title`, o.title);
      await fillField(`officers[${i}].name`, o.name);
      await fillField(`officers[${i}].address`, o.address);
    }
  }
  if (data.signature) {
    await fillField('signature', data.signature);
  }

  // CAPTCHA gate — pause and wait for the user to resume.
  sub._setState(STATES.AWAITING_CAPTCHA);
  sub._emit(EVENT_TYPES.CAPTCHA_REACHED, {
    message: 'CAPTCHA detected. Complete it in the Sunbiz tab, then click Resume.',
  });
  await new Promise((resolve) => { sub.resumeContinuation = resolve; });

  sub._setState(STATES.RUNNING, { phase: 'after_captcha' });
  await wait(400);

  // Payment gate — pause again.
  sub._setState(STATES.AWAITING_PAYMENT);
  sub._emit(EVENT_TYPES.PAYMENT_REACHED, {
    message: 'Payment step reached. Complete payment in the Sunbiz tab, then click Resume.',
    feeUsd: 150,
  });
  await new Promise((resolve) => { sub.resumeContinuation = resolve; });

  sub._setState(STATES.SUBMITTING);
  sub._emit(EVENT_TYPES.SUBMITTING, { message: 'Submitting final form…' });
  await wait(800);

  const confirmation = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  sub.confirmationNumber = confirmation;
  sub._setState(STATES.CONFIRMED, { confirmationNumber: confirmation });
  sub._emit(EVENT_TYPES.CONFIRMED, {
    confirmationNumber: confirmation,
    message: 'Filing complete (mock).',
  });
}

// ---------------------------------------------------------------------------
// Live engine — launches Playwright + FillAnnualReport. Lazy-loaded so the
// dev stack doesn't require Playwright to start. Real CAPTCHA/payment are
// handled by the user in the headed browser window we open for them.
// ---------------------------------------------------------------------------

async function runLiveSubmission(sub) {
  sub._setState(STATES.RUNNING, { engine: 'live' });

  // Dynamic require so the bundler (Next.js / webpack) doesn't try to resolve
  // playwright at build time. The frontend container has neither playwright
  // nor the integrations/ folder; live mode is intended for a separate worker.
  // eslint-disable-next-line no-eval
  const dynamicRequire = eval('require');
  const playwright = dynamicRequire('playwright');
  const { FillAnnualReport } = dynamicRequire(
    require('path').resolve(__dirname, '../../../integrations/sunbiz/scripts/fill-annual-report'),
  );

  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const filler = new FillAnnualReport(page, {
    onEvent: (event) => {
      // Re-emit FillAnnualReport's events as our own.
      sub._emit(event.type, event);
    },
  });

  try {
    await filler.loadSelectors();
    await page.goto('https://services.sunbiz.org/Filings/AnnualReport/FilingStart');

    await filler.fillForm(sub.entityData);

    // Pause for CAPTCHA / payment — the user completes these in the open
    // browser window and clicks Resume in our UI.
    sub._setState(STATES.AWAITING_CAPTCHA);
    await new Promise((resolve) => { sub.resumeContinuation = resolve; });

    sub._setState(STATES.AWAITING_PAYMENT);
    await new Promise((resolve) => { sub.resumeContinuation = resolve; });

    sub._setState(STATES.SUBMITTING);
    await filler.submit({ userApproved: true });

    const confirmation = await filler.captureConfirmation();
    sub.confirmationNumber = confirmation.confirmationNumber;
    sub._setState(STATES.CONFIRMED, {
      confirmationNumber: confirmation.confirmationNumber,
    });
    sub._emit(EVENT_TYPES.CONFIRMED, confirmation);
  } finally {
    await browser.close();
  }
}

/**
 * Kick off a submission. Returns the submission record immediately;
 * the actual work runs in the background and emits events.
 *
 * @param {Object} entityData - Sunbiz-shaped entity data (the same shape
 *   FillAnnualReport expects: documentNumber + principal/mailing addresses
 *   + registeredAgent + officers + signature).
 * @returns {Submission}
 */
function startSubmission(entityData) {
  const sub = createSubmission(entityData);
  const runner = sub.engine === 'live' ? runLiveSubmission : runMockSubmission;

  // Fire and forget. Errors are captured in the submission record.
  Promise.resolve()
    .then(() => runner(sub))
    .catch((err) => {
      sub._setState(STATES.FAILED, { error: err.message });
      sub._emit(EVENT_TYPES.ERROR, { message: err.message, stack: err.stack });
    });

  return sub;
}

function _resetForTests() {
  submissions.clear();
}

module.exports = {
  STATES,
  EVENT_TYPES,
  startSubmission,
  getSubmission,
  subscribe,
  resume,
  _resetForTests,
};
