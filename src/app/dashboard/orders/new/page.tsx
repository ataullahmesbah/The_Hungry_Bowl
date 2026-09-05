import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { OrderComposer } from './order-composer';

export const metadata = { title: 'New order' };
export const dynamic = 'force-dynamic';

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; table?: string }>;
}) {
  await requirePagePermission(PERMISSIONS.ORDER_CREATE, '/dashboard/orders/new');
  const params = await searchParams;
  const settings = await getSettings();

  const [categories, openSessions, customers] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { deletedAt: null, status: 'PUBLISHED' },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        items: {
          // Only orderable items reach the till: an item switched off by a
          // manager simply is not here, which is the PRD §6 requirement.
          where: { deletedAt: null, status: 'PUBLISHED', isAvailable: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            basePrice: true,
            priceDisplayMode: true,
            variants: {
              where: { isAvailable: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true, price: true, isDefault: true },
            },
            addOnGroups: {
              orderBy: { sortOrder: 'asc' },
              select: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    selectionType: true,
                    isRequired: true,
                    minSelect: true,
                    maxSelect: true,
                    addOns: {
                      where: { isAvailable: true },
                      orderBy: { sortOrder: 'asc' },
                      select: { id: true, name: true, price: true, isDefault: true },
                    },
                  },
                },
              },
            },
            media: { take: 1, orderBy: { sortOrder: 'asc' }, select: { media: { select: { secureUrl: true } } } },
          },
        },
      },
    }),
    prisma.tableSession.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'asc' },
      select: {
        id: true,
        code: true,
        guestCount: true,
        guestName: true,
        table: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null, isBlacklisted: false },
      orderBy: { lastVisitAt: 'desc' },
      take: 100,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const usable = categories.filter((c) => c.items.length > 0);

  return (
    <div>
      <PageHeader
        title="New order"
        description="Pick the table, add the items, and send it to the kitchen."
      />

      {openSessions.length === 0 ? (
        <div className="mb-5">
          <Alert tone="warning" title="No table has guests seated">
            Dine-in orders attach to a seated party so they land on one bill. Seat the guests from the floor plan
            first, or record this as a takeaway.
          </Alert>
        </div>
      ) : null}

      <OrderComposer
        categories={serialize(usable)}
        sessions={openSessions.map((s) => ({
          id: s.id,
          code: s.code,
          guestCount: s.guestCount,
          label: `${s.table.name} · ${s.customer?.name ?? s.guestName ?? 'Walk-in'}`,
          orderCount: s._count.orders,
        }))}
        customers={customers}
        currency={toPublicSettings(settings)}
        taxPercent={Number(settings.taxPercent)}
        serviceChargePercent={Number(settings.serviceChargePercent)}
        taxLabel={settings.taxLabel}
        initialSessionId={params.session ?? ''}
      />
    </div>
  );
}
