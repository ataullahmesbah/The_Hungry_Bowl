import Link from 'next/link';
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ClipboardCheck, Receipt } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { buildReconciliation, todayBusinessDate } from '@/lib/service/reconciliation';
import { formatMoney } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Alert, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';

export const metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  await requirePagePermission(PERMISSIONS.FINANCE_VIEW, '/dashboard/finance');
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const today = todayBusinessDate(settings.timezone);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [report, monthSales, monthExpenses, monthPurchases, monthFoodCost] = await Promise.all([
    buildReconciliation(today, settings.timezone),
    prisma.order.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { deletedAt: null, expenseDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { status: { not: 'CANCELLED' }, purchaseDate: { gte: monthStart, lte: monthEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.stockMovement.aggregate({
      where: { type: 'CONSUMPTION', createdAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalCost: true },
    }),
  ]);

  const monthSalesTotal = Number(monthSales._sum.totalAmount ?? 0);
  const monthExpenseTotal = Number(monthExpenses._sum.amount ?? 0);
  const monthFood = Number(monthFoodCost._sum.totalCost ?? 0);
  const monthProfit = monthSalesTotal - monthFood - monthExpenseTotal;

  void startOfDay;
  void endOfDay;

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Today's takings, this month's picture, and where the money went."
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/finance/expenses">
              <Button variant="outline">
                <Receipt className="h-4 w-4" />
                Expenses
              </Button>
            </Link>
            <Link href="/dashboard/finance/closing">
              <Button>
                <ClipboardCheck className="h-4 w-4" />
                Close the day
              </Button>
            </Link>
          </div>
        }
      />

      {report.hasMismatch ? (
        <div className="mb-5">
          <Alert tone="warning" title="Today's sales and payments do not agree">
            Completed orders total {formatMoney(report.orders.salesTotal, currency)} but{' '}
            {formatMoney(report.payments.net, currency)} has been recorded as payment — a difference of{' '}
            <strong>{formatMoney(Math.abs(report.variance), currency)}</strong>.{' '}
            {report.unpaidOrders.length > 0
              ? `${report.unpaidOrders.length} order(s) are still unpaid.`
              : 'Check for payments recorded against the wrong order.'}
          </Alert>
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-espresso-400">Today</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales"
          value={formatMoney(report.orders.salesTotal, currency)}
          sublabel={`${report.orders.completed} completed order(s)`}
          icon="Wallet"
          tone="accent"
        />
        <StatCard
          label="Payments taken"
          value={formatMoney(report.payments.net, currency)}
          sublabel={report.payments.refunded > 0 ? `after ${formatMoney(report.payments.refunded, currency)} refunded` : 'no refunds'}
          icon="CreditCard"
        />
        <StatCard
          label="Expenses"
          value={formatMoney(report.expenses.total, currency)}
          icon="Receipt"
          tone={report.expenses.total > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Estimated food cost"
          value={formatMoney(report.foodCost, currency)}
          sublabel={
            report.orders.salesTotal > 0
              ? `${((report.foodCost / report.orders.salesTotal) * 100).toFixed(0)}% of sales`
              : 'from recipes'
          }
          icon="ChefHat"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today by payment method</CardTitle>
          </CardHeader>
          <CardBody>
            {report.byMethod.length === 0 ? (
              <p className="py-6 text-center text-sm text-espresso-400">No payments recorded today.</p>
            ) : (
              <ul className="divide-y divide-espresso-100">
                {report.byMethod.map((row) => (
                  <li key={row.methodId} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-espresso-900">{row.method}</p>
                      <p className="text-xs text-espresso-400">{row.paymentCount} payment(s)</p>
                    </div>
                    <span className="font-semibold tabular-nums text-espresso-900">
                      {formatMoney(row.expected, currency)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 pt-2.5">
                  <span className="text-sm font-semibold text-espresso-900">Total</span>
                  <span className="font-semibold tabular-nums text-espresso-900">
                    {formatMoney(report.payments.net, currency)}
                  </span>
                </li>
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm">
              <Row label="Sales" value={formatMoney(monthSalesTotal, currency)} />
              <Row label={`Orders`} value={String(monthSales._count)} />
              <Row label="Food cost (from recipes)" value={`− ${formatMoney(monthFood, currency)}`} />
              <Row label="Expenses" value={`− ${formatMoney(monthExpenseTotal, currency)}`} />
              <Row label="Purchases" value={formatMoney(Number(monthPurchases._sum.totalAmount ?? 0), currency)} />
              <div className="border-t border-espresso-100 pt-2">
                <Row
                  label="Contribution"
                  value={formatMoney(monthProfit, currency)}
                  strong
                  danger={monthProfit < 0}
                />
              </div>
            </dl>
            <p className="mt-3 text-xs text-espresso-400">
              Purchases are what you paid suppliers this month; food cost is what was actually consumed from recipes.
              They differ whenever you buy ahead or run stock down.
            </p>
          </CardBody>
        </Card>
      </div>

      {report.unpaidOrders.length > 0 ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Unpaid orders from today</CardTitle>
            <Badge tone="danger">{report.unpaidOrders.length}</Badge>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-espresso-100">
              {report.unpaidOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/dashboard/orders/${order.id}`} className="text-sm font-medium text-espresso-900 hover:text-saffron-700">
                    #{order.orderNumber}
                    {order.table ? <span className="ml-2 text-espresso-400">table {order.table}</span> : null}
                  </Link>
                  <span className="font-semibold tabular-nums text-chilli-600">{formatMoney(order.due, currency)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-espresso-500">{label}</dt>
      <dd
        className={
          danger
            ? 'font-semibold tabular-nums text-chilli-600'
            : strong
              ? 'font-semibold tabular-nums text-espresso-900'
              : 'tabular-nums text-espresso-700'
        }
      >
        {value}
      </dd>
    </div>
  );
}
