/**
 * POST /api/submit/[id]/resume — releases a CAPTCHA or payment pause.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const submissionEngine = require('../../../../../api/sunbiz/submission');

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = submissionEngine.resume(params.id);
  if (!result.ok) {
    return Response.json({ status: 'error', error: result.error }, { status: 400 });
  }
  return Response.json({ status: 'success', submission_id: params.id });
}
