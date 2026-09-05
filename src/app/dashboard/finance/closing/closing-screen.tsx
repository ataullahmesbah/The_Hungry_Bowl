'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDate, formatMoney, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MethodLine {
  methodId: string;
  method: string;
  kind: string;
  expected: number;
  paymentCount: number;
}

interface Report {
  businessDate: string;
  orders: { completed: number; cancelled: number; salesTotal: number };
  payments: { received: number; refunded: number; net: number };
  variance: number;
  hasMismatch: boolean;
  unpaidOrders: { id: string; orderNumber: string; total: number; due: number; table: string | null }[];
  byMethod: MethodLine[];
  expenses: { total: number; byCategory: { name: string; total: number }[] };
  otherIncome: number;
  purchases: number;
  foodCost: number;
  profit: { gross: number; net: number };
}

export function ClosingScreen({
  businessDate,
  report,
  saved,
  history,
  currency,
  timezone,
  locale,
  canClose,
}: {
  businessDate: string;
  report: Report;
  saved: { id: string; varianceTotal: number; note: string | null; closedAt: string } | null;
  history: { id: string; businessDate: string; expectedTotal: number; recordedTotal: number; varianceTotal: number; orderCount: number }[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState(saved?.note ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const totals = useMemo(() => {
    const countedTotal = report.byMethod.reduce((sum, row) => sum + (Number(counted[row.methodId]) || 0), 0);
    const anyCounted = report.byMethod.some((row) => counted[row.methodId] !== undefined && counted[row.methodId] !== '');
    return {
      countedTotal,
      anyCounted,
      variance: Number((countedTotal - report.payments.net).toFixed(2)),
    };
  }, [counted, report]);

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const payload: Record<string, number> = {};
      for (const row of report.byMethod) {
        const value = counted[row.methodId];
        if (value !== undefined && value !== '') payload[row.methodId] = Number(value);
      }
      await api.post('/api/finance/closing', {
        businessDate,
        countedByMethod: payload,
        note: note.trim() || null,
      });
      toast.success('Day closed', 'The reconciliation has been saved.');
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save the closing.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Field label="Business date" className="w-auto">
          <Input
            type="date"
            value={businessDate}
            onChange={(e) => router.push(`/dashboard/finance/closing?date=${e.target.value}`)}
          />
        </Field>
        {saved ? (
          <Badge tone="success">
            closed {formatDate(saved.closedAt, timezone, locale)}
          </Badge>
        ) : (
          <Badge tone="warning">not closed yet</Badge>
        )}
      </div>

      {report.hasMismatch ? (
        <Alert tone="warning" title="Sales and recorded payments do not agree">
          Completed orders total {formatMoney(report.orders.salesTotal, currency)} but only{' '}
          {formatMoney(report.payments.net, currency)} has been recorded as payment — a gap of{' '}
          <strong>{formatMoney(Math.abs(report.variance), currency)}</strong>. This is shown rather than absorbed so it
          can be investigated.
        </Alert>
      ) : (
        <Alert tone="success" title="Sales and payments agree">
          {formatMoney(report.orders.salesTotal, currency)} of completed sales matches the payments recorded.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Count the drawer</CardTitle>
              <p className="text-xs text-espresso-400">Enter what you actually have for each method.</p>
            </CardHeader>
            <CardBody>
              {report.byMethod.length === 0 ? (
                <p className="py-6 text-center text-sm text-espresso-400">No payments were recorded on this day.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-espresso-100 text-left text-xs uppercase tracking-wide text-espresso-400">
                      <tr>
                        <th className="py-2 font-medium">Method</th>
                        <th className="py-2 text-right font-medium">System says</th>
                        <th className="py-2 text-right font-medium">You counted</th>
                        <th className="py-2 text-right font-medium">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-espresso-100">
                      {report.byMethod.map((row) => {
                        const value = counted[row.methodId];
                        const diff = value !== undefined && value !== '' ? Number(value) - row.expected : null;
                        return (
                          <tr key={row.methodId}>
                            <td className="py-2.5">
                              <p className="font-medium text-espresso-900">{row.method}</p>
                              <p className="text-xs text-espresso-400">{row.paymentCount} payment(s)</p>
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-espresso-700">
                              {formatMoney(row.expected, currency)}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                className="w-28 text-right"
                                value={value ?? ''}
                                onChange={(e) => setCounted((prev) => ({ ...prev, [row.methodId]: e.target.value }))}
                                aria-label={`Counted ${row.method}`}
                                disabled={!canClose}
                              />
                            </td>
                            <td
                              className={cn(
                                'py-2.5 text-right font-medium tabular-nums',
                                diff === null
                                  ? 'text-espresso-300'
                                  : Math.abs(diff) < 0.005
                                    ? 'text-basil-600'
                                    : 'text-chilli-600',
                              )}
                            >
                              {diff === null ? '—' : formatMoney(diff, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-espresso-200">
                        <td className="py-2.5 font-semibold text-espresso-900">Total</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-espresso-900">
                          {formatMoney(report.payments.net, currency)}
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-espresso-900">
                          {totals.anyCounted ? formatMoney(totals.countedTotal, currency) : '—'}
                        </td>
                        <td
                          className={cn(
                            'py-2.5 text-right font-semibold tabular-nums',
                            !totals.anyCounted
                              ? 'text-espresso-300'
                              : Math.abs(totals.variance) < 0.5
                                ? 'text-basil-600'
                                : 'text-chilli-600',
                          )}
                        >
                          {totals.anyCounted ? formatMoney(totals.variance, currency) : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {report.unpaidOrders.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Orders still unpaid</CardTitle>
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
                      <span className="font-semibold tabular-nums text-chilli-600">
                        {formatMoney(order.due, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {history.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent closings</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-espresso-100">
                  {history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link
                        href={`/dashboard/finance/closing?date=${String(row.businessDate).slice(0, 10)}`}
                        className="font-medium text-espresso-900 hover:text-saffron-700"
                      >
                        {formatDate(row.businessDate, timezone, locale)}
                      </Link>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-espresso-600">
                          {formatMoney(row.recordedTotal, currency)}
                        </span>
                        {Math.abs(row.varianceTotal) > 0.5 ? (
                          <Badge tone="danger">{formatMoney(row.varianceTotal, currency)}</Badge>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-basil-500" />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>The day</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <dl className="space-y-1.5 text-sm">
                <Row label="Completed orders" value={String(report.orders.completed)} />
                <Row label="Cancelled" value={String(report.orders.cancelled)} />
                <Row label="Sales" value={formatMoney(report.orders.salesTotal, currency)} strong />
                <Row label="Payments taken" value={formatMoney(report.payments.net, currency)} />
                {report.payments.refunded > 0 ? (
                  <Row label="Refunded" value={formatMoney(report.payments.refunded, currency)} danger />
                ) : null}
                {report.hasMismatch ? (
                  <Row label="Unexplained gap" value={formatMoney(report.variance, currency)} danger />
                ) : null}
              </dl>

              <dl className="space-y-1.5 border-t border-espresso-100 pt-3 text-sm">
                <Row label="Food cost" value={formatMoney(report.foodCost, currency)} />
                <Row label="Expenses" value={formatMoney(report.expenses.total, currency)} />
                {report.otherIncome > 0 ? (
                  <Row label="Other income" value={formatMoney(report.otherIncome, currency)} />
                ) : null}
                <Row label="Purchases" value={formatMoney(report.purchases, currency)} />
                <div className="border-t border-espresso-100 pt-1.5">
                  <Row
                    label="Contribution"
                    value={formatMoney(report.profit.net, currency)}
                    strong
                    danger={report.profit.net < 0}
                  />
                </div>
              </dl>

              {report.expenses.byCategory.length > 0 ? (
                <div className="border-t border-espresso-100 pt-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-espresso-400">
                    Expenses by category
                  </p>
                  <ul className="space-y-1 text-xs">
                    {report.expenses.byCategory.map((row) => (
                      <li key={row.name} className="flex justify-between gap-3">
                        <span className="text-espresso-500">{row.name}</span>
                        <span className="tabular-nums text-espresso-700">{formatMoney(row.total, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {canClose ? (
                <div className="space-y-3 border-t border-espresso-100 pt-3">
                  {message ? <Alert tone="danger">{message}</Alert> : null}

                  <Field label="Note" hint="Anything unusual about today.">
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                  </Field>

                  {totals.anyCounted && Math.abs(totals.variance) > 0.5 ? (
                    <p className="flex items-start gap-1.5 rounded bg-saffron-50 px-3 py-2 text-xs text-saffron-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      The drawer differs from the system by {formatMoney(totals.variance, currency)}. Saving records the
                      difference and notifies finance.
                    </p>
                  ) : null}

                  <Button className="w-full" onClick={() => void save()} disabled={pending}>
                    {pending ? <Spinner /> : <ClipboardCheck className="h-4 w-4" />}
                    {saved ? 'Update the closing' : 'Close the day'}
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
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
