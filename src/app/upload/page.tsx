'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SAMPLE_TEXT = `ARTICLES OF INCORPORATION
OF
SUNSHINE TECH SOLUTIONS LLC

ARTICLE I - NAME
The name of this limited liability company is: SUNSHINE TECH SOLUTIONS LLC

ARTICLE II - PRINCIPAL ADDRESS
Principal Business Address: 123 Palm Beach Boulevard, Suite 100, Miami, FL 33139

Mailing Address: P.O. Box 4567, Miami, FL 33140

ARTICLE III - REGISTERED AGENT
The name and Florida street address of the registered agent is:
Registered Agent: John Michael Smith
Agent Address: 456 Corporate Drive, Tampa, FL 33601

ARTICLE IV - MANAGEMENT AND OFFICERS
President: Sarah Elizabeth Johnson
Address: 789 Executive Way, Orlando, FL 32801
Vice President: Michael Robert Chen
Address: 321 Innovation Lane, Jacksonville, FL 32202
Secretary: Amanda Lynn Williams
Address: 555 Business Park Circle, Fort Lauderdale, FL 33301`;

const EXTRACTION_API =
  process.env.NEXT_PUBLIC_EXTRACTION_API || 'http://localhost:8001';

const BINARY_EXTS = ['.pdf', '.docx'];
const TEXT_EXTS = ['.txt', '.md', '.csv'];

export default function UploadPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    const ext = '.' + (picked.name.split('.').pop() || '').toLowerCase();
    if (BINARY_EXTS.includes(ext)) {
      // PDF/DOCX: keep file handle, send as multipart later. Don't try to read as text.
      setFile(picked);
      setText('');
      setError(null);
      return;
    }
    if (TEXT_EXTS.includes(ext) || picked.type.startsWith('text')) {
      setFile(null);
      setError(null);
      setText(await picked.text());
      return;
    }
    setError(`Unsupported file type: ${ext}. Allowed: .pdf, .docx, .txt, .md, .csv`);
  }

  async function uploadBinary(picked: File): Promise<string> {
    const documentId = `demo-${Date.now()}`;
    const form = new FormData();
    form.append('file', picked);
    form.append('document_id', documentId);
    const uploadRes = await fetch(`${EXTRACTION_API}/documents`, {
      method: 'POST',
      body: form,
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
    }

    const extractRes = await fetch(`${EXTRACTION_API}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    });
    if (!extractRes.ok) {
      throw new Error(`Extraction failed (${extractRes.status}): ${await extractRes.text()}`);
    }
    const data = await extractRes.json();
    sessionStorage.setItem(`extraction:${documentId}`, JSON.stringify(data));
    return documentId;
  }

  async function extractText(rawText: string): Promise<string> {
    const documentId = `demo-${Date.now()}`;
    const body = new URLSearchParams({ document_id: documentId, text: rawText });
    const res = await fetch(`${EXTRACTION_API}/extract/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Extraction API returned ${res.status}`);
    }
    const data = await res.json();
    sessionStorage.setItem(`extraction:${documentId}`, JSON.stringify(data));
    return documentId;
  }

  async function handleSubmit() {
    if (!file && !text.trim()) {
      setError('Pick a PDF/DOCX file or paste some text first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const documentId = file ? await uploadBinary(file) : await extractText(text);
      router.push(`/results/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <p><a href="/">← Home</a></p>
      <h1>Upload &amp; Extract</h1>
      <p>Upload Articles of Incorporation (PDF, DOCX, TXT, MD, or CSV) — or paste the text. The extraction service will pull out the entity name, registered agent, addresses, and officers.</p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => { setText(SAMPLE_TEXT); setFile(null); }} disabled={busy}>Load sample text</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>or upload a file:</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFile}
            disabled={busy}
          />
        </label>
        <button onClick={() => { setText(''); setFile(null); }} disabled={busy}>Clear</button>
      </div>

      {file && (
        <p style={{ background: '#eff6ff', padding: '0.6rem 0.9rem', borderRadius: 4, fontSize: 14 }}>
          📄 <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB) — will be sent as a binary upload. The textarea below is ignored for binary files.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); if (e.target.value) setFile(null); }}
        rows={file ? 6 : 18}
        disabled={busy || !!file}
        placeholder={file ? 'Binary file selected above — textarea disabled.' : 'Paste Articles of Incorporation text here...'}
        style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13, padding: '0.75rem', boxSizing: 'border-box' }}
      />

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleSubmit}
          disabled={busy || (!file && !text.trim())}
          style={{ padding: '0.6rem 1.25rem', fontSize: 16, background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? 'Extracting…' : file ? `Upload ${file.name} & extract →` : 'Extract fields →'}
        </button>
        {error && <span style={{ color: '#b91c1c' }}>{error}</span>}
      </div>

      <p style={{ marginTop: '2rem', color: '#6b7280', fontSize: 13 }}>
        Calls <code>POST {EXTRACTION_API}/extract/text</code>. The result is stored in your browser&apos;s sessionStorage and shown on the next page.
      </p>
    </main>
  );
}
