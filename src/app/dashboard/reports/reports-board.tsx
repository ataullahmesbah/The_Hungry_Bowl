'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardBody, Alert, Spinner, Badge } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { BarList, ColumnChart } from '@/components/dashboard/bar-chart';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { api, ApiError } from '@/lib/client/api-client';
import { formatMoney, formatNumber, formatQuantity, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

type Kind = 'sales' | 'finance' | 'inventory' | 'staff';

interface SalesReport {
  range: { label: string };
  summary: {
    orders: number;
    subtotal: number;
    discount: number;
    tax: number;
    serviceCharge: number;
    total: number;
    averageOrder: number;
  };
  byDay: { day: string; orders: number; total: number }[];
  byCategory: { category: string; quantity: number; total: number }[];
  byItem: { item: string; variant: string | null; quantity: number; total: number }[];
  byHour: { hour: number; orders: number; total: number }[];
  byMethod: { method: string; total: number; count: number }[];
}

interface FinanceReport {
  range: { label: string };
  income: { sales: number; other: number; total: number };
  costs: { foodCost: number; expenses: number; purchases: number; total: number };
  expensesByCategory: { name: string; kind: string; total: number }[];
  profit: { gross: number; grossPercent: number; net: number; netPercent: number };
  orderCount: number;
}

interface StaffReport {
  range: { label: string };
  rows: { id: string; name: string; orders: number; sales: number; guests: number; tables: number; averageOrder: number }[];
  summary: { staff: number; orders: number; sales: number };
}

interface InventoryReport {
  items: { id: string; name: string; category: string; unit: string; quantity: number; unitCost: number; value: number; isLow: boolean }[];
  totalValue: number;
  lowCount: number;
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'year', label: '12 months' },
] as const;

/** Escapes a CSV cell so a comma or quote in a dish name cannot break the file. */
function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsBoard({
  currency,
  taxLabel,
  can,
}: {
  currency: CurrencyConfig;
  taxLabel: string;
  can: { sales: boolean; finance: boolean; inventory: boolean };
}) {
  const available = useMemo(
    () =>
      ([
        can.sales ? { key: 'sales' as const, label: 'Sales' } : null,
        can.finance ? { key: 'finance' as const, label: 'Profit & loss' } : null,
        can.sales ? { key: 'staff' as const, label: 'Staff' } : null,
        can.inventory ? { key: 'inventory' as const, label: 'Stock value' } : null,
      ].filter(Boolean) as { key: Kind; label: string }[]),
    [can],
  );

  const [kind, setKind] = useState<Kind>(available[0]?.key ?? 'sales');
  const [preset, setPreset] = useState<string>('month');
  const [data, setData] = useState<SalesReport | FinanceReport | InventoryReport | StaffReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (which: Kind, range: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await api.get(`/api/reports?kind=${which}&preset=${range}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(kind, preset);
  }, [load, kind, preset]);

  const money = (value: number) => formatMoney(value, currency);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-espresso-200 bg-white p-1">
          {available.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setKind(option.key)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                kind === option.key ? 'bg-espresso-900 text-cream-50' : 'text-espresso-600 hover:bg-cream-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {kind !== 'inventory' ? (
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPreset(option.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                  preset === option.key
                    ? 'bg-saffron-500 font-medium text-espresso-950'
                    : 'bg-white text-espresso-600 hover:bg-cream-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <Spinner className="text-espresso-400" /> : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {kind === 'sales' && data && 'byDay' in data ? (
        <SalesView report={data} money={money} taxLabel={taxLabel} />
      ) : null}
      {kind === 'finance' && data && 'profit' in data ? <FinanceView report={data} money={money} /> : null}
      {kind === 'staff' && data && 'rows' in data ? <StaffView report={data} money={money} /> : null}
      {kind === 'inventory' && data && 'totalValue' in data ? <InventoryView report={data} money={money} /> : null}
    </div>
  );
}

function SalesView({
  report,
  money,
  taxLabel,
}: {
  report: SalesReport;
  money: (v: number) => string;
  taxLabel: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={money(report.summary.total)} sublabel={report.range.label} icon="Wallet" tone="accent" />
        <StatCard label="Orders" value={formatNumber(report.summary.orders)} icon="ReceiptText" />
        <StatCard label="Average order" value={money(report.summary.averageOrder)} icon="TrendingUp" />
        <StatCard
          label="Discounts given"
          value={money(report.summary.discount)}
          icon="BadgePercent"
          tone={report.summary.discount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales by day</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv('sales-by-day.csv', [
                ['Day', 'Orders', 'Total'],
                ...report.byDay.map((row) => [row.day, row.orders, row.total]),
              ])
            }
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </CardHeader>
        <CardBody>
          <ColumnChart
            data={report.byDay.map((row) => ({ label: row.day.slice(5), value: row.total }))}
            formatValue={money}
            height={180}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardBody>
            <BarList
              data={report.byCategory.map((row) => ({
                label: row.category,
                value: row.total,
                meta: `${formatNumber(row.quantity)} sold`,
              }))}
              formatValue={money}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardBody>
            <BarList
              data={report.byMethod.map((row) => ({
                label: row.method,
                value: row.total,
                meta: `${row.count} payment(s)`,
              }))}
              formatValue={money}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top dishes</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv('top-dishes.csv', [
                ['Item', 'Size', 'Quantity', 'Total'],
                ...report.byItem.map((row) => [row.item, row.variant ?? '', row.quantity, row.total]),
              ])
            }
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </CardHeader>
        <CardBody>
          <BarList
            data={report.byItem.slice(0, 15).map((row) => ({
              label: row.variant ? `${row.item} · ${row.variant}` : row.item,
              value: row.total,
              meta: `${formatNumber(row.quantity)} sold`,
            }))}
            formatValue={money}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What made up the total</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="space-y-1.5 text-sm">
            <Row label="Item subtotal" value={money(report.summary.subtotal)} />
            {report.summary.discount > 0 ? (
              <Row label="Discounts" value={`− ${money(report.summary.discount)}`} />
            ) : null}
            {report.summary.serviceCharge > 0 ? (
              <Row label="Service charge" value={money(report.summary.serviceCharge)} />
            ) : null}
            {report.summary.tax > 0 ? <Row label={taxLabel} value={money(report.summary.tax)} /> : null}
            <div className="border-t border-espresso-100 pt-1.5">
              <Row label="Total" value={money(report.summary.total)} strong />
            </div>
          </dl>
        </CardBody>
      </Card>
    </>
  );
}

function FinanceView({ report, money }: { report: FinanceReport; money: (v: number) => string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={money(report.income.total)} sublabel={report.range.label} icon="Wallet" tone="accent" />
        <StatCard label="Food cost" value={money(report.costs.foodCost)} icon="ChefHat" />
        <StatCard label="Expenses" value={money(report.costs.expenses)} icon="Receipt" tone="warning" />
        <StatCard
          label="Net contribution"
          value={money(report.profit.net)}
          sublabel={`${report.profit.netPercent.toFixed(1)}% of sales`}
          icon="TrendingUp"
          tone={report.profit.net >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profit and loss</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-1.5 text-sm">
              <Row label="Restaurant sales" value={money(report.income.sales)} />
              {report.income.other > 0 ? <Row label="Other income" value={money(report.income.other)} /> : null}
              <div className="border-t border-espresso-100 pt-1.5">
                <Row label="Total income" value={money(report.income.total)} strong />
              </div>
              <Row label="Food cost (consumed)" value={`− ${money(report.costs.foodCost)}`} />
              <Row label="Operating expenses" value={`− ${money(report.costs.expenses)}`} />
              <div className="border-t border-espresso-100 pt-1.5">
                <Row
                  label="Net contribution"
                  value={money(report.profit.net)}
                  strong
                  danger={report.profit.net < 0}
                />
              </div>
              <Row label="Gross margin" value={`${report.profit.grossPercent.toFixed(1)}%`} />
            </dl>
            <p className="mt-3 text-xs text-espresso-400">
              Food cost is what recipes actually consumed. Purchases in the same period were{' '}
              {money(report.costs.purchases)} — the two differ whenever you buy ahead or run stock down.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardBody>
            <BarList
              data={report.expensesByCategory.map((row) => ({ label: row.name, value: row.total }))}
              formatValue={money}
              emptyMessage="No expenses recorded in this period."
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function InventoryView({ report, money }: { report: InventoryReport; money: (v: number) => string }) {
  const columns: Column<InventoryReport['items'][number]>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (row) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-espresso-900">
            {row.name}
            {row.isLow ? <Badge tone="warning">low</Badge> : null}
          </p>
          <p className="text-xs text-espresso-400">{row.category}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'In stock',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-espresso-700">{formatQuantity(row.quantity, row.unit)}</span>
      ),
    },
    {
      key: 'cost',
      header: 'Avg cost',
      align: 'right',
      render: (row) => <span className="tabular-nums text-espresso-500">{money(row.unitCost)}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (row) => <span className="font-medium tabular-nums text-espresso-900">{money(row.value)}</span>,
    },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value" value={money(report.totalValue)} icon="Wallet" tone="accent" />
        <StatCard label="Items tracked" value={formatNumber(report.items.length)} icon="Package" />
        <StatCard
          label="Low stock"
          value={formatNumber(report.lowCount)}
          icon="PackageMinus"
          tone={report.lowCount > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock valuation</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv('stock-valuation.csv', [
                ['Item', 'Category', 'Quantity', 'Unit', 'Average cost', 'Value'],
                ...report.items.map((row) => [row.name, row.category, row.quantity, row.unit, row.unitCost, row.value]),
              ])
            }
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </CardHeader>
        <DataTable columns={columns} rows={report.items} emptyMessage="No inventory items yet." />
      </Card>
    </>
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

/**
 * Staff view.
 *
 * Ranked by sales rather than order count: twenty small orders is not
 * necessarily a better shift than eight large ones, and ranking by the count
 * alone quietly rewards splitting bills.
 */
function StaffView({ report, money }: { report: StaffReport; money: (v: number) => string }) {
  const ranked = report.rows.map((row, index) => ({ ...row, rank: index + 1 }));

  const columns: Column<(typeof ranked)[number]>[] = [
    {
      key: 'name',
      header: 'Staff member',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="w-5 text-xs tabular-nums text-espresso-400">{row.rank}</span>
          <span className="font-medium text-espresso-900">{row.name}</span>
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      render: (row) => <span className="tabular-nums text-espresso-700">{formatNumber(row.orders)}</span>,
    },
    {
      key: 'tables',
      header: 'Tables',
      align: 'right',
      render: (row) => <span className="tabular-nums text-espresso-500">{formatNumber(row.tables)}</span>,
    },
    {
      key: 'guests',
      header: 'Guests',
      align: 'right',
      render: (row) => <span className="tabular-nums text-espresso-500">{formatNumber(row.guests)}</span>,
    },
    {
      key: 'averageOrder',
      header: 'Average bill',
      align: 'right',
      render: (row) => <span className="tabular-nums text-espresso-700">{money(row.averageOrder)}</span>,
    },
    {
      key: 'sales',
      header: 'Sales',
      align: 'right',
      render: (row) => <span className="font-semibold tabular-nums text-espresso-900">{money(row.sales)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Staff who served" value={formatNumber(report.summary.staff)} />
        <StatCard label="Orders completed" value={formatNumber(report.summary.orders)} />
        <StatCard label="Sales" value={money(report.summary.sales)} />
      </div>

      {report.rows.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sales by staff member</CardTitle>
          </CardHeader>
          <CardBody>
            <BarList
              data={report.rows.slice(0, 10).map((row) => ({
                label: row.name,
                value: row.sales,
                meta: `${formatNumber(row.orders)} order${row.orders === 1 ? '' : 's'}`,
              }))}
              formatValue={money}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Every staff member · {report.range.label}</CardTitle>
        </CardHeader>
        <CardBody>
          <DataTable
            columns={columns}
            rows={ranked}
            emptyMessage="No completed orders in this period."
          />
          <p className="mt-3 text-xs text-espresso-400">
            Counts only orders that were completed and settled. The staff member is whoever created the order, recorded
            automatically — nobody types this in.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
