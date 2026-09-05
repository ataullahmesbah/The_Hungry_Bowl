import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth/guard';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-sent events transport.
 *
 * Only used when REALTIME_DRIVER=sse, which is meant for a long-running Node
 * server (a VPS or a container). On serverless hosting a function is killed at
 * its execution limit, so holding a stream open there just produces reconnect
 * churn — hence polling is the default and this route is opt-in.
 */
export async function GET(request: Request) {
  if (env.REALTIME_DRIVER !== 'sse') {
    return new Response('Server-sent events are disabled. Set REALTIME_DRIVER=sse to enable them.', {
      status: 501,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const session = await requireSession().catch(() => null);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const channels = url.searchParams.get('channels')?.split(',').map((c) => c.trim()).filter(Boolean);
  let cursor = BigInt(Number(url.searchParams.get('cursor') ?? 0));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      send('ready', { cursor: Number(cursor) });

      const timer = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await prisma.realtimeEvent.findMany({
            where: {
              id: { gt: cursor },
              ...(channels?.length ? { channel: { in: channels } } : {}),
            },
            orderBy: { id: 'asc' },
            take: 100,
          });

          if (rows.length > 0) cursor = rows[rows.length - 1]!.id;

          for (const row of rows) {
            if (row.requiredPermission && !session.user.permissions.has(row.requiredPermission)) continue;
            send('message', {
              id: Number(row.id),
              channel: row.channel,
              type: row.type,
              payload: row.payload,
              createdAt: row.createdAt,
            });
          }

          // Comment frames keep proxies from closing an idle connection.
          if (rows.length === 0) controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch (error) {
          console.error('[realtime:sse] poll failed', error);
        }
      }, Math.max(1000, env.REALTIME_POLL_MS));

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
