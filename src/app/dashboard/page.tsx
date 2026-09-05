import Link from 'next/link';
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { requirePageSession } from '@/lib/auth/guard';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { formatMoney, formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requirePageSession('/dashboard');
  const settings = await getSettings();
  const currency = toPublicSettings(settings);
  const perms = session.user.permissions;

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const canSeeSales = perms.has(PERMISSIONS.REPORT_SALES) || perms.has(PERMISSIONS.FINANCE_VIEW);
  const canSeeOrders = perms.has(PERMISSIONS.ORDER_VIEW);
  const canSeeTables = perms.has(PERMISSIONS.TABLE_VIEW);
  const canSeeReservations = perms.has(PERMISSIONS.RESERVATION_VIEW);
  const canSeeInventory = perms.has(PERMISSIONS.INVENTORY_VIEW);

  const [todaySales, todayOrders, activeOrders, tableStats, pendingReservations, todayReservations, recentOrders] =
    await Promise.all([
      canSeeSales
        ? prisma.order.aggregate({
            where: { status: 'COMPLETED', completedAt: { gte: dayStart, lte: dayEnd } },
            _sum: { totalAmount: true },
            _count: true,
          })
        : null,
      canSeeOrders
        ? prisma.order.count({ where: { createdAt: { gte: dayStart, lte: dayEnd }, status: { not: 'DRAFT' } } })
        : null,
      canSeeOrders
        ? prisma.order.count({ where: { status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } } })
        : null,
      canSeeTables ? prisma.restaurantTable.groupBy({ by: ['status'], _count: true, where: { isActive: true } }) : null,
      canSeeReservations ? prisma.reservation.count({ where: { status: 'PENDING' } }) : null,
      canSeeReservations
        ? prisma.reservation.findMany({
            where: { reservedAt: { gte: dayStart, lte: dayEnd }, status: { in: ['PENDING', 'CONFIRMED'] } },
            orderBy: { reservedAt: 'asc' },
            take: 6,
            select: { id: true, code: true, name: true, guestCount: true, reservedAt: true, status: true },
          })
        : null,
      canSeeOrders
        ? prisma.order.findMany({
            where: { status: { not: 'DRAFT' } },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              orderNumber: true,
              secretCode: true,
              status: true,
              totalAmount: true,
              createdAt: true,
              table: { select: { name: true } },
            },
          })
        : null,
    ]);

  const lowStockCount = canSeeInventory
    ? await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM inventory_items i
        WHERE i."isActive" = true
          AND i."deletedAt" IS NULL
          AND i."reorderLevel" > 0
          AND COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b."itemId" = i.id), 0) <= i."reorderLevel"
      `.then((rows) => Number(rows[0]?.count ?? 0)).catch(() => 0)
    : 0;

  const tableCounts = Object.fromEntries((tableStats ?? []).map((t) => [t.status, t._count]));
  const totalTables = (tableStats ?? []).reduce((sum, t) => sum + t._count, 0);

  const yesterdaySales = canSeeSales
    ? await prisma.order.aggregate({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: startOfDay(subDays(now, 1)), lte: endOfDay(subDays(now, 1)) },
        },
        _sum: { totalAmount: true },
      })
    : null;

  const todayTotal = Number(todaySales?._sum.totalAmount ?? 0);
  const yesterdayTotal = Number(yesterdaySales?._sum.totalAmount ?? 0);
  const delta = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null;

  const statusTone: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
    PLACED: 'info',
    ACCEPTED: 'info',
    PREPARING: 'warning',
    READY: 'success',
    SERVED: 'neutral',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    DRAFT: 'neutral',
  };

  return (
    <div>
      <PageHeader
        title={`Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, ${session.user.name.split(' ')[0]}`}
        description={`${settings.name} · ${formatDateTime(now, settings.timezone, settings.locale)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeSales ? (
          <StatCard
            label="Today's sales"
            value={formatMoney(todayTotal, currency)}
            sublabel={
              delta === null
                ? `${todaySales?._count ?? 0} completed orders`
                : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}% vs yesterday`
            }
            icon="Wallet"
            tone="accent"
            href="/dashboard/reports"
          />
        ) : null}

        {canSeeOrders ? (
          <>
            <StatCard
              label="Orders today"
              value={todayOrders ?? 0}
              sublabel={`${activeOrders ?? 0} still in service`}
              icon="ReceiptText"
              href="/dashboard/orders"
            />
            <StatCard
              label="Active orders"
              value={activeOrders ?? 0}
              sublabel="Placed, preparing or ready"
              icon="Flame"
              tone={(activeOrders ?? 0) > 0 ? 'warning' : 'neutral'}
              href="/dashboard/orders?status=active"
            />
          </>
        ) : null}

        {canSeeTables ? (
          <StatCard
            label="Tables occupied"
            value={`${tableCounts.OCCUPIED ?? 0} / ${totalTables}`}
            sublabel={`${tableCounts.FREE ?? 0} free · ${tableCounts.RESERVED ?? 0} reserved`}
            icon="Grid3x3"
            href="/dashboard/tables"
          />
        ) : null}

        {canSeeReservations ? (
          <StatCard
            label="Reservations pending"
            value={pendingReservations ?? 0}
            sublabel="Waiting for confirmation"
            icon="CalendarCheck"
            tone={(pendingReservations ?? 0) > 0 ? 'warning' : 'neutral'}
            href="/dashboard/reservations?status=PENDING"
          />
        ) : null}

        {canSeeInventory ? (
          <StatCard
            label="Low stock items"
            value={lowStockCount}
            sublabel="At or below reorder level"
            icon="PackageMinus"
            tone={lowStockCount > 0 ? 'danger' : 'success'}
            href="/dashboard/inventory?filter=low"
          />
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {canSeeOrders ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Recent orders</CardTitle>
              </div>
              <Link href="/dashboard/orders" className="text-xs font-medium text-saffron-700 hover:underline">
                View all
              </Link>
            </CardHeader>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-espresso-100 text-left text-xs uppercase tracking-wide text-espresso-400">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Order</th>
                      <th className="px-5 py-2.5 font-medium">Table</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                      <th className="px-5 py-2.5 text-right font-medium">Total</th>
                      <th className="px-5 py-2.5 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-espresso-100">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-cream-50">
                        <td className="px-5 py-3">
                          <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-espresso-900 hover:text-saffron-700">
                            #{order.orderNumber}
                          </Link>
                          <span className="ml-2 rounded bg-espresso-100 px-1.5 py-0.5 font-mono text-[11px] text-espresso-600">
                            {order.secretCode}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-espresso-600">{order.table?.name ?? '—'}</td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone[order.status] ?? 'neutral'}>{order.status}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-medium tabular-nums text-espresso-900">
                          {formatMoney(order.totalAmount, currency)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-espresso-400">
                          {formatDateTime(order.createdAt, settings.timezone, settings.locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No orders yet"
                description="Orders created from the dashboard will appear here."
              />
            )}
          </Card>
        ) : null}

        {canSeeReservations ? (
          <Card>
            <CardHeader>
              <CardTitle>Today’s reservations</CardTitle>
              <Link href="/dashboard/reservations" className="text-xs font-medium text-saffron-700 hover:underline">
                View all
              </Link>
            </CardHeader>
            {todayReservations && todayReservations.length > 0 ? (
              <ul className="divide-y divide-espresso-100">
                {todayReservations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-espresso-900">{r.name}</p>
                      <p className="text-xs text-espresso-400">
                        {r.guestCount} guest{r.guestCount === 1 ? '' : 's'} · {r.code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums text-espresso-900">
                        {new Intl.DateTimeFormat(settings.locale, {
                          timeStyle: 'short',
                          timeZone: settings.timezone,
                        }).format(r.reservedAt)}
                      </p>
                      <Badge tone={r.status === 'CONFIRMED' ? 'success' : 'warning'}>{r.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing booked today" description="New reservation requests will show up here." />
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
