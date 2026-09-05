import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { env } from '@/lib/env';

const querySchema = z.object({
  /** Last event id the client has seen. Omit on first connect. */
  cursor: z.coerce.number().int().min(0).default(0),
  channels: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Polling transport for the realtime bus.
 *
 * This is the default driver because it works everywhere — Vercel's serverless
 * runtime, a container, a plain VPS — with no persistent connection and no
 * managed pub/sub service to pay for. Clients hold a cursor and ask for what
 * is newer; the SSE route is the same data over a held-open stream for hosts
 * that allow it.
 *
 * Events are filtered by permission here, so a kitchen screen can never pull a
 * finance event just by asking for the channel.
 */
export const GET = route(
  { querySchema, rateLimit: { bucket: 'realtime-poll', limit: 1200, windowSeconds: 60 } },
  async ({ query, session }) => {
    const channels = query.channels?.split(',').map((c) => c.trim()).filter(Boolean);

    const rows = await prisma.realtimeEvent.findMany({
      where: {
        ...(query.cursor > 0 ? { id: { gt: BigInt(query.cursor) } } : {}),
        ...(channels?.length ? { channel: { in: channels } } : {}),
        // A first connect only needs recent history, not the whole log.
        ...(query.cursor === 0 ? { createdAt: { gte: new Date(Date.now() - 60_000) } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit,
    });

    const visible = rows.filter(
      (row) => !row.requiredPermission || session!.user.permissions.has(row.requiredPermission),
    );

    const lastId = rows.length > 0 ? rows[rows.length - 1]!.id : BigInt(query.cursor);

    return apiSuccess({
      cursor: Number(lastId),
      pollMs: env.REALTIME_POLL_MS,
      events: visible.map((row) => ({
        id: Number(row.id),
        channel: row.channel,
        type: row.type,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
    });
  },
);
