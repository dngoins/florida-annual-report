/**
 * POST /api/reconcile
 *
 * Compares extracted document fields against the live Sunbiz record.
 * Backed by the same diff engine as the Express API gateway
 * (src/api/sunbiz/*) so behavior stays in sync.
 *
 * In the demo dev stack the Next.js frontend is the only Node server
 * we ship, so this route is the practical entry point. The matching
 * Express handler at src/api/routes/reconcile.js exists for the
 * production deployment topology.
 */

import { NextResponse } from 'next/server';

// CommonJS interop — these are plain Node modules under src/api.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/sunbiz/client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { diff } = require('../../../api/sunbiz/diff');

export const runtime = 'nodejs';

type Officer = { name: string; title: string; address?: string | null };
type ExtractedFields = {
  entity_name?: string | null;
  registered_agent_name?: string | null;
  principal_address?: string | null;
  mailing_address?: string | null;
  officers?: Officer[];
};
type ReconcileRequest = {
  document_number?: string;
  entity_name?: string;
  extracted: ExtractedFields;
};

export async function POST(req: Request) {
  let body: ReconcileRequest;
  try {
    body = (await req.json()) as ReconcileRequest;
  } catch {
    return NextResponse.json({ status: 'error', error: 'invalid JSON body' }, { status: 400 });
  }

  const { document_number: documentNumber, entity_name: entityName, extracted } = body || ({} as ReconcileRequest);
  if (!extracted || typeof extracted !== 'object') {
    return NextResponse.json(
      { status: 'error', error: 'extracted fields are required' },
      { status: 400 },
    );
  }
  if (!documentNumber && !entityName && !extracted.entity_name) {
    return NextResponse.json(
      { status: 'error', error: 'document_number or entity_name is required' },
      { status: 400 },
    );
  }

  const lookup = documentNumber
    ? await client.lookupByDocumentNumber(documentNumber)
    : await client.searchByName(entityName || extracted.entity_name);

  if (!lookup.found) {
    return NextResponse.json({
      status: 'not_found',
      sunbiz: null,
      extracted,
      diff: null,
      error: lookup.error || 'Sunbiz record not found',
    });
  }

  return NextResponse.json({
    status: 'success',
    sunbiz: lookup.data,
    extracted,
    diff: diff(extracted, lookup.data),
  });
}
