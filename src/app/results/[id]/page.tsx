'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Officer = { name: string; title: string; address?: string | null };
type ExtractionResult = {
  status: string;
  document_id: string;
  extraction_method: string;
  confidence: Record<string, number>;
  needs_review: Record<string, boolean>;
  fields: {
    entity_name?: string | null;
    registered_agent_name?: string | null;
    principal_address?: string | null;
    mailing_address?: string | null;
    officers?: Officer[];
  };
};

function bgFor(confidence: number) {
  if (confidence >= 0.9) return '#dcfce7'; // green
  if (confidence >= 0.75) return '#fef9c3'; // yellow
  return '#fee2e2'; // red
}
function labelFor(confidence: number) {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'LOW — review required';
}

function Field({ name, value, confidence }: { name: string; value?: string | null; confidence: number }) {
  const display = value && value.trim() ? value : '(not found)';
  return (
    <div style={{ background: bgFor(confidence), border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151' }}>
        <strong>{name}</strong>
        <span>confidence: {confidence.toFixed(2)} ({labelFor(confidence)})</span>
      </div>
      <div style={{ marginTop: '0.25rem', fontSize: 15 }}>{display}</div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<ExtractionResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // sessionStorage is browser-only; reading on mount avoids SSR mismatch.
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(`extraction:${id}`) : null;
    if (raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(JSON.parse(raw));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [id]);

  if (!ready) {
    return <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>Loading…</main>;
  }

  if (!data) {
    return (
      <main style={{ maxWidth: 800, margin: '3rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>No result found</h1>
        <p>The extraction for <code>{id}</code> isn&apos;t in this browser session. Run a new extraction:</p>
        <p><a href="/upload">→ Go to Upload</a></p>
      </main>
    );
  }

  const f = data.fields;
  const c = data.confidence;
  const needsReviewCount = Object.values(data.needs_review).filter(Boolean).length;

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <p><a href="/upload">← Upload another</a></p>
      <h1>Extraction Results</h1>
      <p style={{ color: '#6b7280' }}>
        Document <code>{data.document_id}</code> · method <code>{data.extraction_method}</code>
        {needsReviewCount > 0 && (
          <> · <span style={{ color: '#b91c1c', fontWeight: 600 }}>{needsReviewCount} field(s) need review</span></>
        )}
      </p>

      <h2 style={{ marginTop: '1.5rem' }}>Entity</h2>
      <Field name="Entity name" value={f.entity_name} confidence={c.entity_name ?? 0} />
      <Field name="Registered agent" value={f.registered_agent_name} confidence={c.registered_agent_name ?? 0} />
      <Field name="Principal address" value={f.principal_address} confidence={c.principal_address ?? 0} />
      <Field name="Mailing address" value={f.mailing_address} confidence={c.mailing_address ?? 0} />

      <h2 style={{ marginTop: '1.5rem' }}>Officers / Directors</h2>
      {f.officers && f.officers.length > 0 ? (
        <div style={{ background: bgFor(c.officers ?? 0), border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: '0.5rem' }}>
            confidence: {(c.officers ?? 0).toFixed(2)} ({labelFor(c.officers ?? 0)})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>Title</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Name</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Address</th>
              </tr>
            </thead>
            <tbody>
              {f.officers.map((o, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{o.title}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{o.name}</td>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{o.address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: '#6b7280' }}>No officers extracted.</p>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Raw response</h2>
      <details>
        <summary style={{ cursor: 'pointer', color: '#2563eb' }}>Show JSON</summary>
        <pre style={{ background: '#f3f4f6', padding: '1rem', overflow: 'auto', fontSize: 12 }}>{JSON.stringify(data, null, 2)}</pre>
      </details>

      <ReconcileSection extracted={f} defaultEntityName={f.entity_name || ''} confidence={c} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation section — compares the extracted fields against the live
// Sunbiz record (currently served by the mock client behind /api/reconcile).
// ---------------------------------------------------------------------------

type DiffField = {
  field: string;
  fieldLabel: string;
  current_value: string | null;
  extracted_value: string | null;
  status: 'match' | 'mismatch' | 'missing_extracted' | 'missing_sunbiz';
};
type OfficerChange = {
  name: string;
  title: { extracted: string; sunbiz: string; match: boolean };
  address: { extracted: string | null; sunbiz: string | null; match: boolean };
};
type ReconcileResponse = {
  status: 'success' | 'not_found' | 'error';
  sunbiz: { entityName: string; documentNumber: string; status: string } | null;
  diff: {
    summary: {
      totalFields: number;
      matchingFields: number;
      mismatchedFields: number;
      missingFields: number;
      matchPercentage: number;
      officersMatched: number;
      officersChanged: number;
      officersAdded: number;
      officersRemoved: number;
    };
    fields: DiffField[];
    officers: {
      matched: Array<{ name: string; title: string; address?: string | null }>;
      changed: OfficerChange[];
      added: Array<{ name: string; title: string; address?: string | null }>;
      removed: Array<{ name: string; title: string; address?: string | null }>;
    };
  } | null;
  error?: string;
};

function statusBadge(status: DiffField['status']) {
  const map: Record<DiffField['status'], { bg: string; fg: string; label: string }> = {
    match: { bg: '#dcfce7', fg: '#166534', label: 'MATCH' },
    mismatch: { bg: '#fee2e2', fg: '#991b1b', label: 'MISMATCH' },
    missing_extracted: { bg: '#fef9c3', fg: '#854d0e', label: 'MISSING (from PDF)' },
    missing_sunbiz: { bg: '#fef9c3', fg: '#854d0e', label: 'MISSING (on Sunbiz)' },
  };
  const m = map[status];
  return (
    <span style={{ background: m.bg, color: m.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

function ReconcileSection({ extracted, defaultEntityName, confidence }: { extracted: ExtractionResult['fields']; defaultEntityName: string; confidence: Record<string, number> }) {
  const [docNumber, setDocNumber] = useState('P25000065600');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runReconcile() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_number: docNumber.trim() || undefined,
          entity_name: defaultEntityName,
          extracted,
        }),
      });
      const json: ReconcileResponse = await resp.json();
      setResult(json);
      if (json.status === 'not_found' || json.status === 'error') {
        setError(json.error || 'Sunbiz lookup failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '2rem', padding: '1rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <h2 style={{ marginTop: 0 }}>Reconcile with Sunbiz</h2>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 0 }}>
        Compare the extracted fields above against the live Sunbiz record. (Demo uses a mock client; set <code>SUNBIZ_MOCK=0</code> when the live scraper ships.)
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <label htmlFor="doc-num" style={{ fontSize: 14 }}>Document #:</label>
        <input
          id="doc-num"
          value={docNumber}
          onChange={(e) => setDocNumber(e.target.value)}
          placeholder="e.g. P25000065600"
          style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: 220 }}
        />
        <button
          onClick={runReconcile}
          disabled={loading}
          style={{ padding: '0.4rem 1rem', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: loading ? 'wait' : 'pointer', fontSize: 14 }}
        >
          {loading ? 'Comparing…' : 'Compare with Sunbiz →'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 14 }}>
          {error}
        </div>
      )}

      {result?.status === 'success' && result.diff && result.sunbiz && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', fontSize: 14 }}>
            <span><strong>Sunbiz entity:</strong> {result.sunbiz.entityName} ({result.sunbiz.documentNumber}) · {result.sunbiz.status}</span>
            <span><strong>Field match:</strong> {result.diff.summary.matchingFields}/{result.diff.summary.totalFields} ({result.diff.summary.matchPercentage}%)</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: '1rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>Field</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Sunbiz (current)</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>From PDF</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.diff.fields.map((f) => (
                <tr key={f.field} style={{ borderBottom: '1px solid #e5e7eb', background: f.status === 'mismatch' ? '#fef2f2' : 'transparent' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{f.fieldLabel}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{f.current_value ?? '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{f.extracted_value ?? '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{statusBadge(f.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: 16 }}>Officers</h3>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: '0.5rem' }}>
            {result.diff.summary.officersMatched} matched · {result.diff.summary.officersChanged} changed · {result.diff.summary.officersAdded} added · {result.diff.summary.officersRemoved} removed
          </div>
          {result.diff.officers.changed.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#fef9c3', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Officer (changed)</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Sunbiz</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>From PDF</th>
                </tr>
              </thead>
              <tbody>
                {result.diff.officers.changed.map((c, i) => (
                  <React.Fragment key={i}>
                    <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td rowSpan={2} style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.4rem 0.6rem', background: c.title.match ? 'transparent' : '#fee2e2' }}>title: {c.title.sunbiz}</td>
                      <td style={{ padding: '0.4rem 0.6rem', background: c.title.match ? 'transparent' : '#fee2e2' }}>title: {c.title.extracted}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.4rem 0.6rem', background: c.address.match ? 'transparent' : '#fee2e2' }}>addr: {c.address.sunbiz ?? '—'}</td>
                      <td style={{ padding: '0.4rem 0.6rem', background: c.address.match ? 'transparent' : '#fee2e2' }}>addr: {c.address.extracted ?? '—'}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          {(result.diff.officers.added.length > 0 || result.diff.officers.removed.length > 0) && (
            <div style={{ fontSize: 13, color: '#374151' }}>
              {result.diff.officers.added.length > 0 && (
                <div><strong>Only in PDF:</strong> {result.diff.officers.added.map((o) => `${o.title} ${o.name}`).join(', ')}</div>
              )}
              {result.diff.officers.removed.length > 0 && (
                <div><strong>Only on Sunbiz:</strong> {result.diff.officers.removed.map((o) => `${o.title} ${o.name}`).join(', ')}</div>
              )}
            </div>
          )}

          <SubmitSection
            extracted={extracted}
            confidence={confidence}
            documentNumber={docNumber}
            mismatchedFields={result.diff.summary.mismatchedFields}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submit section — runs after Reconcile. Enforces user_approved + confidence
// gate, streams live events from the Automation Agent (mock or Playwright),
// and surfaces CAPTCHA / payment pauses with Resume controls.
// ---------------------------------------------------------------------------

type SubmissionEvent = {
  type: string;
  timestamp: string;
  message?: string;
  field?: string;
  value?: string;
  confirmationNumber?: string;
  state?: string;
  [k: string]: unknown;
};

function eventColor(type: string): string {
  if (type === 'error') return '#fee2e2';
  if (type === 'confirmed') return '#dcfce7';
  if (type === 'captcha_reached' || type === 'payment_reached') return '#fef3c7';
  if (type === 'field_filled') return '#f3f4f6';
  return '#eff6ff';
}

function SubmitSection({
  extracted,
  confidence,
  documentNumber,
  mismatchedFields,
}: {
  extracted: ExtractionResult['fields'];
  confidence: Record<string, number>;
  documentNumber: string;
  mismatchedFields: number;
}) {
  const [userApproved, setUserApproved] = useState(false);
  const [overrideMismatch, setOverrideMismatch] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [events, setEvents] = useState<SubmissionEvent[]>([]);
  const [state, setState] = useState<string>('idle');
  const [signature, setSignature] = useState<string>(extracted.registered_agent_name || '');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Confidence gate: every field >= 0.75 (officers checked too).
  const lowConfidenceFields = Object.entries(confidence)
    .filter(([, score]) => score < 0.75)
    .map(([field]) => field);
  const confidenceOk = lowConfidenceFields.length === 0;
  const mismatchOk = mismatchedFields === 0 || overrideMismatch;
  const canSubmit = userApproved && confidenceOk && mismatchOk && !submissionId;

  useEffect(() => {
    if (!submissionId) return;
    const es = new EventSource(`/api/submit/${submissionId}/events`);
    const handler = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data) as SubmissionEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'audit' && typeof ev.state === 'string') setState(ev.state);
        if (ev.type === 'captcha_reached') setState('awaiting_captcha');
        if (ev.type === 'payment_reached') setState('awaiting_payment');
        if (ev.type === 'confirmed' && typeof ev.confirmationNumber === 'string') {
          setConfirmation(ev.confirmationNumber);
          setState('confirmed');
        }
        if (ev.type === 'error') {
          setError(typeof ev.message === 'string' ? ev.message : 'submission failed');
          setState('failed');
        }
      } catch { /* ignore parse errors */ }
    };
    // Listen on every named event type the server emits.
    [
      'submission_created', 'navigation', 'field_filled', 'captcha_reached',
      'payment_reached', 'resumed', 'form_complete', 'submitting',
      'confirmed', 'error', 'audit',
    ].forEach((t) => es.addEventListener(t, handler as EventListener));
    es.onerror = () => { es.close(); };
    return () => es.close();
  }, [submissionId]);

  async function startSubmit() {
    setError(null);
    setEvents([]);
    setConfirmation(null);
    try {
      const resp = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_approved: true,
          document_number: documentNumber,
          signature,
          extracted,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status === 'error') {
        setError(json.error || 'submission failed');
        return;
      }
      setSubmissionId(json.submission_id);
      setState(json.state || 'running');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  async function resumeSubmit() {
    if (!submissionId) return;
    setError(null);
    try {
      const resp = await fetch(`/api/submit/${submissionId}/resume`, { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok || json.status === 'error') {
        setError(json.error || 'resume failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  const awaitingHuman = state === 'awaiting_captcha' || state === 'awaiting_payment';

  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#ffffff', border: '2px solid #2563eb', borderRadius: 6 }}>
      <h3 style={{ marginTop: 0, color: '#1e40af' }}>Submit to Sunbiz</h3>
      <p style={{ fontSize: 13, color: '#374151', marginTop: 0 }}>
        The Automation Agent will fill the Annual Report on sunbiz.org and pause for you to complete CAPTCHA and payment.
        Per CONSTITUTION.md, submission requires <code>user_approved: true</code> and is blocked when any field has confidence &lt; 0.75.
      </p>

      {!confidenceOk && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 13, marginBottom: '0.5rem' }}>
          <strong>Blocked:</strong> these fields have confidence &lt; 0.75 — review them above before submitting: <code>{lowConfidenceFields.join(', ')}</code>
        </div>
      )}

      {mismatchedFields > 0 && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#fef3c7', color: '#854d0e', borderRadius: 4, fontSize: 13, marginBottom: '0.5rem' }}>
          <strong>{mismatchedFields} field(s) differ from Sunbiz.</strong>{' '}
          <label style={{ marginLeft: 4 }}>
            <input type="checkbox" checked={overrideMismatch} onChange={(e) => setOverrideMismatch(e.target.checked)} />{' '}
            I&apos;ve reviewed the differences and want to submit the updated values.
          </label>
        </div>
      )}

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ fontSize: 14 }}>
          Electronic signature:{' '}
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={!!submissionId}
            style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, width: 280 }}
          />
        </label>
      </div>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: 14 }}>
        <input
          type="checkbox"
          checked={userApproved}
          onChange={(e) => setUserApproved(e.target.checked)}
          disabled={!!submissionId}
        />{' '}
        I have reviewed the data above and approve submission to Sunbiz on behalf of this entity.
      </label>

      <button
        onClick={startSubmit}
        disabled={!canSubmit}
        style={{
          padding: '0.5rem 1.25rem',
          background: canSubmit ? '#16a34a' : '#9ca3af',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {submissionId ? 'Submission in progress…' : 'Submit to Sunbiz →'}
      </button>

      {error && (
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      )}

      {submissionId && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: '0.5rem' }}>
            <strong>Submission:</strong> <code>{submissionId}</code> · state: <code>{state}</code>
          </div>

          {awaitingHuman && (
            <div style={{ padding: '0.75rem 1rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, color: '#854d0e' }}>
                {state === 'awaiting_captcha' ? '🛑 CAPTCHA required' : '💳 Payment required'}
              </div>
              <div style={{ fontSize: 13, color: '#854d0e', marginTop: '0.25rem' }}>
                Complete the step in the Sunbiz browser tab, then click below to continue.
              </div>
              <button
                onClick={resumeSubmit}
                style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
              >
                I&apos;ve completed {state === 'awaiting_captcha' ? 'CAPTCHA' : 'payment'} — continue →
              </button>
            </div>
          )}

          {confirmation && (
            <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 4, marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, color: '#166534' }}>✓ Filing confirmed</div>
              <div style={{ fontSize: 14, color: '#166534' }}>
                Confirmation number: <code>{confirmation}</code>
              </div>
            </div>
          )}

          <details>
            <summary style={{ cursor: 'pointer', color: '#2563eb', fontSize: 13 }}>Event log ({events.length})</summary>
            <div style={{ maxHeight: 300, overflow: 'auto', marginTop: '0.5rem', border: '1px solid #e5e7eb', borderRadius: 4 }}>
              {events.map((ev, i) => (
                <div key={i} style={{ padding: '0.3rem 0.6rem', background: eventColor(ev.type), borderBottom: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                  <span style={{ color: '#6b7280' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>{' '}
                  <strong>{ev.type}</strong>
                  {ev.field && <> · {ev.field}{ev.value ? `: ${ev.value}` : ''}</>}
                  {ev.message && <> · {ev.message}</>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
