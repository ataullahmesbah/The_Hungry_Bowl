'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody, Alert, Spinner, Badge } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { BarList, ColumnChart } from '@/components/dashboard/bar-chart';
import { api, ApiError } from '@/lib/client/api-client';
import { formatMoney, formatNumber, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Analytics {
  range: { label: string };
  orders: { count: number; total: number; averageOrderValue: number };
  bestSellers: { item: string; quantity: number; total: number }[];
  slowMovers: { item: string; quantity: number }[];
  byWeekday: { weekday: number; orders: number; total: number }[];
  byHour: { hour: number; orders: number; total: number }[];
  reservations: { total: number; guests: number; byStatus: Record<string, number> };
  tableUse: { table: string; sessions: number; guests: number; revenue: number }[];
  kitchen: { averageMinutes: number | null; slowestMinutes: number | null; tickets: number };
  wastage: { cost: number; events: number };
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'year', label: '12 months' },
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AnalyticsBoard({
  initialPreset,
  currency,
}: {
  initialPreset: string;
  currency: CurrencyConfig;
}) {
  const [preset, setPreset] = useState(initialPreset);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<Analytics>(`/api/analytics?preset=${which}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(preset);
  }, [load, preset]);

  const money = (value: number) => formatMoney(value, currency);

  // Peak hours cover only the hours the restaurant actually traded, so an
  // empty overnight stretch does not squash the bars that matter.
  const hours = data?.byHour ?? [];
  const busiestHour = hours.length ? hours.reduce((a, b) => (b.orders > a.orders ? b : a)) : null;
  const busiestDay = data?.byWeekday.length
    ? data.byWeekday.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  return (
    <div className="space-y-5">
      {/* Filters sit in one row above the charts. */}
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setPreset(option.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm transition-colors',
              preset === option.key
                ? 'bg-espresso-900 font-medium text-cream-50'
                : 'bg-white text-espresso-600 hover:bg-cream-200',
            )}
          >
            {option.label}
          </button>
        ))}
        {loading ? <Spinner className="ml-2 text-espresso-400" /> : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Orders" value={formatNumber(data.orders.count)} sublabel={data.range.label} icon="ReceiptText" />
            <StatCard label="Sales" value={money(data.orders.total)} icon="Wallet" tone="accent" />
            <StatCard label="Average order" value={money(data.orders.averageOrderValue)} icon="TrendingUp" />
            <StatCard
              label="Kitchen time"
              value={data.kitchen.averageMinutes != null ? `${data.kitchen.averageMinutes} min` : '—'}
              sublabel={
                data.kitchen.tickets > 0
                  ? `across ${data.kitchen.tickets} ticket(s), slowest ${data.kitchen.slowestMinutes} min`
                  : 'no tickets yet'
              }
              icon="ChefHat"
              tone={data.kitchen.averageMinutes != null && data.kitchen.averageMinutes > 25 ? 'warning' : 'neutral'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Sales by day of the week</CardTitle>
                  {busiestDay ? (
                    <p className="mt-0.5 text-xs text-espresso-400">
                      Busiest: {WEEKDAYS[busiestDay.weekday]} · {money(busiestDay.total)}
                    </p>
                  ) : null}
                </div>
              </CardHeader>
              <CardBody>
                <ColumnChart
                  data={data.byWeekday.map((row) => ({
                    label: WEEKDAYS[row.weekday] ?? String(row.weekday),
                    value: row.total,
                  }))}
                  formatValue={money}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Peak hours
                  </CardTitle>
                  {busiestHour ? (
                    <p className="mt-0.5 text-xs text-espresso-400">
                      Busiest hour: {String(busiestHour.hour).padStart(2, '0')}:00 with {busiestHour.orders} order(s)
                    </p>
                  ) : null}
                </div>
              </CardHeader>
              <CardBody>
                <ColumnChart
                  data={hours.map((row) => ({
                    label: `${String(row.hour).padStart(2, '0')}`,
                    value: row.orders,
                  }))}
                  formatValue={(v) => `${formatNumber(v)} order${v === 1 ? '' : 's'}`}
                />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-basil-600" />
                  Best sellers
                </CardTitle>
              </CardHeader>
              <CardBody>
                <BarList
                  data={data.bestSellers.map((row) => ({
                    label: row.item,
                    value: row.quantity,
                    meta: money(row.total),
                  }))}
                  formatValue={(v) => `${formatNumber(v)} sold`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-espresso-400" />
                    Slow movers
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-espresso-400">
                    Published dishes that barely sold. Worth a look at the next menu review.
                  </p>
                </div>
              </CardHeader>
              <CardBody>
                <BarList
                  data={data.slowMovers.map((row) => ({ label: row.item, value: row.quantity }))}
                  formatValue={(v) => (v === 0 ? 'none sold' : `${formatNumber(v)} sold`)}
                  emptyMessage="Everything on the menu sold at least once."
                />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Table use</CardTitle>
              </CardHeader>
              <CardBody>
                <BarList
                  data={data.tableUse
                    .filter((row) => row.sessions > 0)
                    .map((row) => ({
                      label: row.table,
                      value: row.revenue,
                      meta: `${row.sessions} sitting(s) · ${row.guests} guest(s)`,
                    }))}
                  formatValue={money}
                  maxRows={12}
                  emptyMessage="No tables were used in this period."
                />
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Reservations
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-espresso-400">Bookings</p>
                      <p className="text-xl font-semibold tabular-nums text-espresso-900">
                        {formatNumber(data.reservations.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-espresso-400">Guests expected</p>
                      <p className="text-xl font-semibold tabular-nums text-espresso-900">
                        {formatNumber(data.reservations.guests)}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(data.reservations.byStatus).map(([status, count]) => (
                      <li key={status}>
                        <Badge
                          tone={
                            status === 'COMPLETED'
                              ? 'success'
                              : status === 'NO_SHOW' || status === 'CANCELLED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {status.toLowerCase().replace('_', ' ')}: {count}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-chilli-500" />
                    Wastage
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="text-2xl font-semibold tabular-nums text-espresso-900">{money(data.wastage.cost)}</p>
                  <p className="mt-0.5 text-sm text-espresso-400">
                    across {data.wastage.events} recorded event{data.wastage.events === 1 ? '' : 's'}
                    {data.orders.total > 0
                      ? ` · ${((data.wastage.cost / data.orders.total) * 100).toFixed(1)}% of sales`
                      : ''}
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      ) : loading ? null : (
        <Card>
          <p className="px-5 py-14 text-center text-sm text-espresso-400">No data for this period yet.</p>
        </Card>
      )}
    </div>
  );
}
