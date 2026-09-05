import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { KdsBoard, type Ticket } from '@/components/kitchen/kds-board';

export const metadata = { title: 'Kitchen Display', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Standalone full-screen kitchen display, PRD §9.
 *
 * Deliberately outside the dashboard shell: this runs on a wall monitor where
 * the sidebar and topbar would only take space away from tickets.
 */
export default async function KdsPage() {
  const session = await requirePagePermission(PERMISSIONS.KITCHEN_VIEW, '/kds');
  const settings = await getSettings();

  const rows = await prisma.kitchenTicket.findMany({
    where: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] } },
    orderBy: [{ priority: 'desc' }, { receivedAt: 'asc' }],
    take: 60,
    include: {
      items: { orderBy: { id: 'asc' } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          secretCode: true,
          type: true,
          note: true,
          guestCount: true,
          table: { select: { name: true } },
          session: { select: { code: true } },
        },
      },
    },
  });

  return (
    <KdsBoard
      initialTickets={serialize(rows) as unknown as Ticket[]}
      driver={env.REALTIME_DRIVER}
      pollMs={env.REALTIME_POLL_MS}
      soundEnabled={settings.kdsSoundEnabled}
      fullscreen
      canAccept={session.user.permissions.has(PERMISSIONS.KITCHEN_ACCEPT)}
    />
  );
}
