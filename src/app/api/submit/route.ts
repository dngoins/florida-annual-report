/**
 * POST /api/submit
 *
 * Starts a Sunbiz annual-report submission. The actual filing runs in the
 * background; clients stream /api/submit/[id]/events for progress.
 *
 * Critical safety gate (CONSTITUTION.md / CLAUDE.md):
 *   user_approved MUST be true. Returns 403 + USER_APPROVAL_REQUIRED otherwise.
 */

import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const submissionEngine = require('../../../api/sunbiz/submission');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mapExtractedToSunbiz } = require('../../../api/sunbiz/mapper');

export const runtime = 'nodejs';

type ExtractedFields = {
  entity_name?: string | null;
  registered_agent_name?: string | null;
  principal_address?: string | null;
  mailing_address?: string | null;
  officers?: Array<{ name: string; title: string; address?: string | null }>;
};
type SubmitRequest = {
  user_approved?: boolean;
  document_number?: string;
  signature?: string;
  extracted?: ExtractedFields;
};

export async function POST(req: Request) {
  let body: SubmitRequest;
  try {
    body = (await req.json()) as SubmitRequest;
  } catch {
    return NextResponse.json({ status: 'error', error: 'invalid JSON body' }, { status: 400 });
  }

  const { user_approved, document_number: documentNumber, signature, extracted } =
    body || ({} as SubmitRequest);

  if (user_approved !== true) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Submission blocked: user_approved must be explicitly set to true.',
        code: 'USER_APPROVAL_REQUIRED',
      },
      { status: 403 },
    );
  }
  if (!extracted) {
    return NextResponse.json(
      { status: 'error', error: 'extracted fields are required' },
      { status: 400 },
    );
  }
  if (!documentNumber) {
    return NextResponse.json(
      { status: 'error', error: 'document_number is required to look up the Sunbiz entity' },
      { status: 400 },
    );
  }

  const entityData = mapExtractedToSunbiz(extracted, {
    documentNumber,
    signature: signature || extracted.registered_agent_name || '',
  });

  const sub = submissionEngine.startSubmission(entityData);

  return NextResponse.json(
    {
      status: 'success',
      submission_id: sub.id,
      state: sub.state,
      engine: sub.engine,
      created_at: sub.createdAt,
      message: 'Submission started. Stream events from /api/submit/{id}/events.',
    },
    { status: 202 },
  );
}
