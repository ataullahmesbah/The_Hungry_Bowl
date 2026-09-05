import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { summariseSession } from '@/lib/service/sessions';
import { elapsedLabel, formatDateTime, formatMoney, maskReference } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Table session' };
export const dynamic = 'force-dynamic';

/**
 * The bill for one seating. Orders are listed separately but total together,
 * which is exactly how a party that orders in rounds should be billed.
 */
export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const auth = await requirePagePermission(PERMISSIONS.TABLE_VIEW, `/dashboard/tables/${sessionId}`);
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const record = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      table: { select: { id: true, name: true, capacity: true } },
      customer: { select: { id: true, name: true, phone: true } },
      orders: {
        orderBy: { createdAt: 'asc' },
        include: {
          items: { include: { options: true } },
          payments: { include: { method: { select: { name: true } } } },
        },
      },
    },
  });

  if (!record) notFound();

  const totals = summariseSession(record.orders.filter((o) => o.status !== 'CANCELLED'));
  const canCreateOrders = auth.user.permissions.has(PERMISSIONS.ORDER_CREATE);

  return (
    <div>
      <PageHeader
        title={`${record.table.name} · session ${record.code}`}
        description={`${record.customer?.name ?? record.guestName ?? 'Walk-in'} · ${record.guestCount} guest${record.guestCount === 1 ? '' : 's'}`}
        actions={
          <Link href="/dashboard/tables" className="text-sm text-espresso-500 hover:text-espresso-800">
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
            Floor plan
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {record.orders.length === 0 ? (
            <Card>
              <EmptyState
                title="No orders on this bill yet"
                description="Add the party's first order to start the bill."
                action={
                  canCreateOrders && record.status === 'OPEN' ? (
                    <Link href={`/dashboard/orders/new?session=${record.id}`}>
                      <Button>Add an order</Button>
                    </Link>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            record.orders.map((order) => (
              <Card key={order.id}>
                <CardHeader>
                  <div>
                    <CardTitle>
                      Order #{order.orderNumber}
                      <span className="ml-2 rounded bg-espresso-100 px-1.5 py-0.5 font-mono text-xs font-normal text-espresso-600">
                        {order.secretCode}
                      </span>
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-espresso-400">
                      {formatDateTime(order.createdAt, settings.timezone, settings.locale)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={order.status === 'COMPLETED' ? 'success' : order.status === 'CANCELLED' ? 'danger' : 'warning'}>
                      {order.status.toLowerCase()}
                    </Badge>
                    <Badge tone={order.paymentState === 'PAID' ? 'success' : 'neutral'}>
                      {order.paymentState.toLowerCase().replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3">
                  <ul className="divide-y divide-espresso-100">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-4 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-espresso-900">
                            <span className="font-medium tabular-nums">{item.quantity}×</span> {item.itemName}
                            {item.variantName ? (
                              <span className="text-espresso-500"> · {item.variantName}</span>
                            ) : null}
                          </p>
                          {item.options.length > 0 ? (
                            <p className="mt-0.5 text-xs text-espresso-400">
                              {item.options.map((o) => o.addOnName).join(', ')}
                            </p>
                          ) : null}
                          {item.note ? (
                            <p className="mt-0.5 text-xs italic text-saffron-700">“{item.note}”</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums text-espresso-900">
                          {formatMoney(item.lineTotal, currency)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <dl className="space-y-1 border-t border-espresso-100 pt-3 text-sm">
                    <Row label="Subtotal" value={formatMoney(order.subtotal, currency)} />
                    {Number(order.discountAmount) > 0 ? (
                      <Row label={`Discount${order.discountReason ? ` (${order.discountReason})` : ''}`} value={`− ${formatMoney(order.discountAmount, currency)}`} />
                    ) : null}
                    {Number(order.serviceChargeAmount) > 0 ? (
                      <Row label={`Service charge ${Number(order.serviceChargePercent)}%`} value={formatMoney(order.serviceChargeAmount, currency)} />
                    ) : null}
                    {Number(order.taxAmount) > 0 ? (
                      <Row label={`${settings.taxLabel} ${Number(order.taxPercent)}%`} value={formatMoney(order.taxAmount, currency)} />
                    ) : null}
                    <Row label="Total" value={formatMoney(order.totalAmount, currency)} strong />
                    {Number(order.paidAmount) > 0 ? (
                      <Row label="Paid" value={formatMoney(order.paidAmount, currency)} />
                    ) : null}
                    {Number(order.dueAmount) > 0 ? (
                      <Row label="Due" value={formatMoney(order.dueAmount, currency)} danger />
                    ) : null}
                  </dl>

                  {order.payments.length > 0 ? (
                    <ul className="space-y-1 border-t border-espresso-100 pt-3 text-xs text-espresso-500">
                      {order.payments.map((payment) => (
                        <li key={payment.id} className="flex justify-between gap-3">
                          <span>
                            {payment.method.name}
                            {payment.reference ? ` · ${maskReference(payment.reference)}` : ''}
                          </span>
                          <span className="tabular-nums">{formatMoney(payment.amount, currency)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <Link href={`/dashboard/orders/${order.id}`}>
                      <Button size="sm" variant="outline">
                        Open order
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <Badge tone={record.status === 'OPEN' ? 'warning' : 'neutral'}>{record.status.toLowerCase()}</Badge>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-espresso-600">
                <Users className="h-4 w-4 text-espresso-400" />
                {record.guestCount} guest{record.guestCount === 1 ? '' : 's'}
              </p>
              <p className="flex items-center gap-2 text-espresso-600">
                <Clock className="h-4 w-4 text-espresso-400" />
                {record.status === 'OPEN'
                  ? `Seated ${elapsedLabel(record.openedAt)} ago`
                  : `Closed ${formatDateTime(record.closedAt, settings.timezone, settings.locale)}`}
              </p>
              {record.notes ? (
                <p className="rounded bg-cream-100 px-3 py-2 text-xs text-espresso-600">{record.notes}</p>
              ) : null}

              <dl className="space-y-1 border-t border-espresso-100 pt-3">
                <Row label="Orders" value={String(totals.orderCount)} />
                <Row label="Bill total" value={formatMoney(totals.total, currency)} strong />
                <Row label="Paid" value={formatMoney(totals.paid, currency)} />
                {totals.due > 0 ? <Row label="Outstanding" value={formatMoney(totals.due, currency)} danger /> : null}
              </dl>

              {record.status === 'OPEN' && canCreateOrders ? (
                <Link href={`/dashboard/orders/new?session=${record.id}`} className="block pt-1">
                  <Button className="w-full">Add another order</Button>
                </Link>
              ) : null}
            </CardBody>
          </Card>

          {record.status === 'OPEN' ? (
            <Alert tone="info" title="Separate bills, same table">
              When this party leaves, clear the table from the floor plan. The next party gets a brand new session and a
              bill of their own — the two are never mixed.
            </Alert>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={danger ? 'text-chilli-600' : 'text-espresso-500'}>{label}</dt>
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
