import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { formatDate, formatMoney } from '@/lib/format';
import { PageHeader, Card, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';

export const metadata = { title: 'Purchases' };
export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  const session = await requirePagePermission(PERMISSIONS.PURCHASE_VIEW, '/dashboard/purchases');
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const [purchases, totals] = await Promise.all([
    prisma.purchase.findMany({
      orderBy: { purchaseDate: 'desc' },
      take: 100,
      include: {
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.purchase.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true, dueAmount: true },
      _count: true,
    }),
  ]);

  const rows = serialize(purchases);

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Deliveries from suppliers and what they cost."
        actions={
          session.user.permissions.has(PERMISSIONS.PURCHASE_MANAGE) ? (
            <Link href="/dashboard/purchases/new">
              <Button>
                <Plus className="h-4 w-4" />
                Record a purchase
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Purchases" value={totals._count} icon="ShoppingCart" />
        <StatCard label="Total spent" value={formatMoney(Number(totals._sum.totalAmount ?? 0), currency)} icon="Wallet" tone="accent" />
        <StatCard
          label="Still owed"
          value={formatMoney(Number(totals._sum.dueAmount ?? 0), currency)}
          icon="AlertCircle"
          tone={Number(totals._sum.dueAmount ?? 0) > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-espresso-400">
            No purchases recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-espresso-100 text-left text-xs uppercase tracking-wide text-espresso-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Purchase</th>
                  <th className="px-5 py-2.5 font-medium">Supplier</th>
                  <th className="px-5 py-2.5 font-medium">Into</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Total</th>
                  <th className="px-5 py-2.5 text-right font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-espresso-100">
                {rows.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-cream-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-espresso-900">{purchase.purchaseNo}</p>
                      <p className="text-xs text-espresso-400">
                        {formatDate(purchase.purchaseDate, settings.timezone, settings.locale)} ·{' '}
                        {purchase._count.items} line{purchase._count.items === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-espresso-600">{purchase.supplier?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-espresso-600">{purchase.warehouse.name}</td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          purchase.status === 'RECEIVED'
                            ? 'success'
                            : purchase.status === 'CANCELLED'
                              ? 'danger'
                              : purchase.status === 'PARTIALLY_RECEIVED'
                                ? 'warning'
                                : 'info'
                        }
                      >
                        {purchase.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-espresso-900">
                      {formatMoney(purchase.totalAmount, currency)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {purchase.dueAmount > 0 ? (
                        <span className="font-medium text-chilli-600">{formatMoney(purchase.dueAmount, currency)}</span>
                      ) : (
                        <span className="text-espresso-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
