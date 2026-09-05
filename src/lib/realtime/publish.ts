import 'server-only';
import { prisma } from '@/lib/db';

export type RealtimeChannel = 'orders' | 'kitchen' | 'tables' | 'menu' | 'reservations' | 'inventory';

export interface RealtimeEventInput {
  channel: RealtimeChannel;
  type: string;
  payload: Record<string, unknown>;
  /** Clients without this permission never receive the event. */
  requiredPermission?: string;
}

/**
 * Publishes to the database-backed event log that both realtime drivers read.
 *
 * A long-lived in-process socket server cannot exist on serverless hosting, so
 * the database is the shared bus. Publishing must never fail the business
 * operation that triggered it, hence the swallowed error.
 */
export async function publishEvent(input: RealtimeEventInput): Promise<void> {
  try {
    await prisma.realtimeEvent.create({
      data: {
        channel: input.channel,
        type: input.type,
        payload: JSON.parse(JSON.stringify(input.payload)),
        requiredPermission: input.requiredPermission ?? null,
      },
    });
  } catch (error) {
    console.error('[realtime] publish failed', error);
  }
}

/** Housekeeping: the log only needs a short window to serve reconnecting clients. */
export async function pruneEvents(olderThanMinutes = 120): Promise<void> {
  await prisma.realtimeEvent
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } } })
    .catch(() => undefined);
}
