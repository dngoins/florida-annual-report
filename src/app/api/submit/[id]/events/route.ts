/**
 * GET /api/submit/[id]/events  — Server-Sent Events stream of progress.
 * Closes when the submission reaches a terminal state (confirmed | error).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const submissionEngine = require('../../../../../api/sunbiz/submission');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMINAL_EVENTS = new Set(['confirmed', 'error']);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sub = submissionEngine.getSubmission(params.id);
  if (!sub) {
    return new Response('submission not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let keepalive: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        if (unsubscribe) unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      const send = (event: { type: string; [k: string]: unknown }) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          close();
          return;
        }
        if (TERMINAL_EVENTS.has(event.type)) close();
      };
      unsubscribe = submissionEngine.subscribe(params.id, send);
      keepalive = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { close(); }
      }, 15000);
    },
    cancel() {
      closed = true;
      if (keepalive) clearInterval(keepalive);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
