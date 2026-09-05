import Link from 'next/link';
import { startOfDay, endOfDay } from 'date-fns';
import { Settings2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { formatMoney } from '@/lib/format';
import { PageHeader, Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';
import { PaymentsTable } from './payments-table';

export const metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const session = await requirePagePermission(PERMISSIONS.PAYMENT_VIEW, '/dashboard/payments');
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const [payments, byMethod, todayTotal, outstanding] = await Promise.all([
    prisma.payment.findMany({
      where: { receivedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: {
        method: { select: { id: true, name: true, kind: true } },
        order: {
          select: { id: true, orderNumber: true, secretCode: true, table: { select: { name: true } } },
        },
      },
    }),
    prisma.payment.groupBy({
      by: ['methodId'],
      where: { receivedAt: { gte: dayStart, lte: dayEnd }, status: 'COMPLETED' },
      _sum: { amount: true, refundedAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { receivedAt: { gte: dayStart, lte: dayEnd }, status: 'COMPLETED' },
      _sum: { amount: true, refundedAmount: true },
    }),
    prisma.order.aggregate({
      where: { status: { notIn: ['CANCELLED', 'DRAFT'] }, dueAmount: { gt: 0 } },
      _sum: { dueAmount: true },
      _count: true,
    }),
  ]);

  const methods = await prisma.paymentMethod.findMany({
    where: { id: { in: byMethod.map((m) => m.methodId) } },
    select: { id: true, name: true },
  });
  const methodNames = new Map(methods.map((m) => [m.id, m.name]));

  const received = Number(todayTotal._sum.amount ?? 0);
  const refunded = Number(todayTotal._sum.refundedAmount ?? 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Money taken at the restaurant today. The website never takes an online payment."
        actions={
          session.user.permissions.has(PERMISSIONS.PAYMENT_METHOD_MANAGE) ? (
            <Link href="/dashboard/payments/methods">
              <Button variant="outline">
                <Settings2 className="h-4 w-4" />
                Payment methods
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Received today" value={formatMoney(received, currency)} icon="Wallet" tone="success" />
        <StatCard label="Refunded today" value={formatMoney(refunded, currency)} icon="Undo2" tone={refunded > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Net today" value={formatMoney(received - refunded, currency)} icon="TrendingUp" tone="accent" />
        <StatCard
          label="Outstanding"
          value={formatMoney(Number(outstanding._sum.dueAmount ?? 0), currency)}
          sublabel={`${outstanding._count} order(s) unpaid`}
          icon="AlertCircle"
          tone={Number(outstanding._sum.dueAmount ?? 0) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {byMethod.length > 0 ? (
        <Card className="mb-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-espresso-900">Today by method</h2>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {byMethod.map((row) => (
              <li key={row.methodId} className="rounded-lg border border-espresso-100 px-3 py-2">
                <p className="text-xs text-espresso-400">{methodNames.get(row.methodId) ?? 'Unknown'}</p>
                <p className="mt-0.5 font-semibold tabular-nums text-espresso-900">
                  {formatMoney(Number(row._sum.amount ?? 0) - Number(row._sum.refundedAmount ?? 0), currency)}
                </p>
                <p className="text-[11px] text-espresso-400">{row._count} payment(s)</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <PaymentsTable
          payments={serialize(payments)}
          currency={currency}
          timezone={settings.timezone}
          locale={settings.locale}
        />
      </Card>
    </div>
  );
}
