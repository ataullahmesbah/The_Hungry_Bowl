import { startOfDay, endOfDay, addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { ReservationsBoard } from './reservations-board';

export const metadata = { title: 'Reservations' };
export const dynamic = 'force-dynamic';

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.RESERVATION_VIEW, '/dashboard/reservations');
  const params = await searchParams;
  const settings = await getSettings();

  const now = new Date();

  const [reservations, tables] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: 'PENDING' },
          { reservedAt: { gte: startOfDay(now), lte: endOfDay(addDays(now, 30)) } },
        ],
      },
      orderBy: { reservedAt: 'asc' },
      take: 200,
      include: {
        table: { select: { id: true, name: true, capacity: true } },
        customer: { select: { id: true, name: true } },
        session: { select: { id: true, code: true } },
      },
    }),
    prisma.restaurantTable.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, capacity: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Reservations"
        description="Requests from the website and bookings taken over the phone."
      />
      <ReservationsBoard
        reservations={serialize(reservations)}
        tables={tables}
        timezone={settings.timezone}
        locale={settings.locale}
        phoneCode={settings.phoneCountryCode}
        initialStatus={params.status ?? ''}
        canManage={session.user.permissions.has(PERMISSIONS.RESERVATION_MANAGE)}
        canSeat={session.user.permissions.has(PERMISSIONS.TABLE_SESSION_MANAGE)}
      />
    </div>
  );
}
