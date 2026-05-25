'use client';

import { useEffect, useState } from 'react';
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
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(`extraction:${id}`);
    if (!raw) {
      setMissing(true);
      return;
    }
    setData(JSON.parse(raw));
  }, [id]);

  if (missing) {
    return (
      <main style={{ maxWidth: 800, margin: '3rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>No result found</h1>
        <p>The extraction for <code>{id}</code> isn&apos;t in this browser session. Run a new extraction:</p>
        <p><a href="/upload">→ Go to Upload</a></p>
      </main>
    );
  }

  if (!data) {
    return <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>Loading…</main>;
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

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
        <strong>Next step (not yet wired):</strong> reconcile these fields against the live Sunbiz record and submit via the Automation Agent. See <a href="/docs/how-to-file-annual-report.md">the filing guide</a>.
      </div>
    </main>
  );
}
