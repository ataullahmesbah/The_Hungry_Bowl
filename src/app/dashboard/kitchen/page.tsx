import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { KdsBoard, type Ticket } from '@/components/kitchen/kds-board';

export const metadata = { title: 'Kitchen' };
export const dynamic = 'force-dynamic';

async function loadTickets(): Promise<Ticket[]> {
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
  return serialize(rows) as unknown as Ticket[];
}

export default async function KitchenPage() {
  const session = await requirePagePermission(PERMISSIONS.KITCHEN_VIEW, '/dashboard/kitchen');
  const settings = await getSettings();
  const tickets = await loadTickets();

  return (
    <KdsBoard
      initialTickets={tickets}
      driver={env.REALTIME_DRIVER}
      pollMs={env.REALTIME_POLL_MS}
      soundEnabled={settings.kdsSoundEnabled}
      canAccept={session.user.permissions.has(PERMISSIONS.KITCHEN_ACCEPT)}
    />
  );
}
