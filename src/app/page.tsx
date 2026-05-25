export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Florida Annual Report</h1>
      <p>Automated Florida Annual Report filing platform.</p>
      <h2>Services</h2>
      <ul>
        <li>
          Extraction API:{' '}
          <a href="http://localhost:8001/docs" target="_blank" rel="noreferrer">
            http://localhost:8001/docs
          </a>
        </li>
        <li>
          Review a filing: <code>/review/&lt;id&gt;</code> (e.g.{' '}
          <a href="/review/demo-001">/review/demo-001</a>)
        </li>
      </ul>
      <h2>Quick test</h2>
      <p>
        See <code>scripts/sample-requests.http</code> for ready-to-run requests against the
        extraction service.
      </p>
    </main>
  );
}
