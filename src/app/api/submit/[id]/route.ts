/**
 * GET /api/submit/[id]   — JSON snapshot of current state + event log
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const submissionEngine = require('../../../../api/sunbiz/submission');

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sub = submissionEngine.getSubmission(params.id);
  if (!sub) {
    return Response.json({ status: 'error', error: 'submission not found' }, { status: 404 });
  }
  return Response.json({
    status: 'success',
    submission: {
      id: sub.id,
      state: sub.state,
      engine: sub.engine,
      createdAt: sub.createdAt,
      confirmationNumber: sub.confirmationNumber,
      events: sub.events,
    },
  });
}
