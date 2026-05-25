export default function HomePage() {
  return (
    <main style={{ maxWidth: 800, margin: '3rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Florida Annual Report</h1>
      <p>Automated Florida Annual Report filing platform — local dev demo.</p>

      <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: '#2563eb', color: 'white', borderRadius: 8 }}>
        <h2 style={{ margin: 0, color: 'white' }}>Try it</h2>
        <p style={{ marginBottom: '1rem' }}>Paste Articles of Incorporation text and see the extraction pipeline pull out entity, agent, addresses, and officers.</p>
        <a href="/upload" style={{ display: 'inline-block', padding: '0.6rem 1.25rem', background: 'white', color: '#2563eb', borderRadius: 4, fontWeight: 600, textDecoration: 'none' }}>
          Start: Upload &amp; Extract →
        </a>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Backend services</h2>
      <ul>
        <li>Extraction API health: <a href="http://localhost:8001/health" target="_blank" rel="noreferrer">http://localhost:8001/health</a></li>
        <li>Extraction API docs: <a href="http://localhost:8001/docs" target="_blank" rel="noreferrer">http://localhost:8001/docs</a> (Swagger UI)</li>
      </ul>

      <h2>Documentation</h2>
      <ul>
        <li><a href="https://github.com/dngoins/florida-annual-report/blob/main/docs/how-to-file-annual-report.md">How to file your Florida annual report</a></li>
        <li><a href="https://github.com/dngoins/florida-annual-report/blob/main/scripts/sample-requests.http">Sample HTTP requests</a></li>
      </ul>

      <p style={{ marginTop: '2rem', color: '#6b7280', fontSize: 13 }}>
        <strong>Note:</strong> Authentication is disabled in local dev. See README → Local Development.
      </p>
    </main>
  );
}
