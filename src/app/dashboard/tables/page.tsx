import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { summariseSession } from '@/lib/service/sessions';
import { PageHeader } from '@/components/ui/primitives';
import { FloorPlan } from './floor-plan';

export const metadata = { title: 'Tables' };
export const dynamic = 'force-dynamic';

export default async function TablesPage() {
  const session = await requirePagePermission(PERMISSIONS.TABLE_VIEW, '/dashboard/tables');
  const settings = await getSettings();

  const [tables, areas, customers] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { deletedAt: null },
      orderBy: [{ area: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        area: { select: { id: true, name: true, floor: true } },
        sessions: {
          where: { status: 'OPEN' },
          take: 1,
          include: {
            customer: { select: { id: true, name: true } },
            orders: {
              where: { status: { not: 'CANCELLED' } },
              select: {
                id: true,
                orderNumber: true,
                secretCode: true,
                status: true,
                totalAmount: true,
                paidAmount: true,
                dueAmount: true,
              },
            },
          },
        },
      },
    }),
    prisma.tableArea.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.customer.findMany({
      where: { deletedAt: null, isBlacklisted: false },
      orderBy: { lastVisitAt: 'desc' },
      take: 100,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const rows = tables.map((table) => {
    const open = table.sessions[0];
    return {
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      status: table.status,
      shape: table.shape,
      isActive: table.isActive,
      notes: table.notes,
      area: table.area,
      session: open
        ? {
            id: open.id,
            code: open.code,
            guestCount: open.guestCount,
            guestName: open.guestName,
            customerName: open.customer?.name ?? null,
            openedAt: open.openedAt.toISOString(),
            orders: open.orders.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              secretCode: o.secretCode,
              status: o.status,
            })),
            totals: summariseSession(open.orders),
          }
        : null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Floor plan"
        description="Seat a party, see what each table owes, and clear the table when they leave."
      />
      <FloorPlan
        tables={serialize(rows)}
        areas={areas.map((a) => ({ id: a.id, name: a.name, floor: a.floor }))}
        customers={customers}
        currency={toPublicSettings(settings)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManageSessions={session.user.permissions.has(PERMISSIONS.TABLE_SESSION_MANAGE)}
        canCreateOrders={session.user.permissions.has(PERMISSIONS.ORDER_CREATE)}
        canRecordPayments={session.user.permissions.has(PERMISSIONS.PAYMENT_RECORD)}
      />
    </div>
  );
}
