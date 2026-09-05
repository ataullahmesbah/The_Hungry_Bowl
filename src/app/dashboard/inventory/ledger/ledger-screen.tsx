'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Card, CardBody, EmptyState } from '@/components/ui/primitives';
import { formatMoney, formatQuantity, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LedgerLocation } from '@/lib/service/stock-ledger';

export function LedgerScreen({
  locations,
  warehouses,
  from,
  to,
  warehouseId,
  currency,
}: {
  locations: LedgerLocation[];
  warehouses: { id: string; name: string; kind: string }[];
  from: string;
  to: string;
  warehouseId: string;
  currency: CurrencyConfig;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ from, to, warehouseId });

  function apply() {
    const query = new URLSearchParams({ from: draft.from, to: draft.to });
    if (draft.warehouseId) query.set('warehouseId', draft.warehouseId);
    router.push(`/dashboard/inventory/ledger?${query.toString()}`);
  }

  function quick(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400_000);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const next = { ...draft, from: key(start), to: key(end) };
    setDraft(next);
    const query = new URLSearchParams({ from: next.from, to: next.to });
    if (next.warehouseId) query.set('warehouseId', next.warehouseId);
    router.push(`/dashboard/inventory/ledger?${query.toString()}`);
  }

  const withRows = locations.filter((l) => l.rows.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </Field>
          <Field label="Store">
            <Select
              value={draft.warehouseId}
              onChange={(e) => setDraft((d) => ({ ...d, warehouseId: e.target.value }))}
            >
              <option value="">All stores (separately)</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={apply}>Show ledger</Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => quick(0)}>
              Today
            </Button>
            <Button size="sm" variant="ghost" onClick={() => quick(7)}>
              7 days
            </Button>
            <Button size="sm" variant="ghost" onClick={() => quick(30)}>
              30 days
            </Button>
          </div>
        </CardBody>
      </Card>

      {withRows.length === 0 ? (
        <EmptyState
          title="Nothing moved in this range"
          description="No stock came in or went out of these stores between those dates."
        />
      ) : (
        withRows.map((location) => (
          <section key={location.warehouseId} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-espresso-900">
                <Warehouse className="h-4 w-4 text-espresso-400" />
                {location.warehouseName}
                <span className="text-xs font-normal uppercase tracking-wide text-espresso-400">
                  {location.kind.toLowerCase()}
                </span>
              </h2>
              <p className="text-xs text-espresso-500">
                closing value <span className="font-medium text-espresso-800">{formatMoney(location.totals.closingValue, currency)}</span>
              </p>
            </div>

            <div className="overflow-x-auto rounded-[--radius-card] border border-espresso-100 bg-white">
              <table className="w-full min-w-[70rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-espresso-100 bg-cream-50 text-xs uppercase tracking-wide text-espresso-500">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Opening</th>
                    <th className="px-3 py-2 text-right font-medium">Purchased</th>
                    <th className="px-3 py-2 text-right font-medium">Transfer in</th>
                    <th className="px-3 py-2 text-right font-medium">Returned in</th>
                    <th className="px-3 py-2 text-right font-medium">Transfer out</th>
                    <th className="px-3 py-2 text-right font-medium">Used</th>
                    <th className="px-3 py-2 text-right font-medium">Wastage</th>
                    <th className="px-3 py-2 text-right font-medium">Returned out</th>
                    <th className="px-3 py-2 text-right font-medium">Count adj.</th>
                    <th className="px-3 py-2 text-right font-medium">Closing</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {location.rows.map((row) => {
                    const adjustment = row.adjustmentIn - row.adjustmentOut;
                    return (
                      <tr key={row.itemId} className="border-b border-espresso-50 last:border-0">
                        <td className="px-3 py-2 font-medium text-espresso-900">{row.itemName}</td>
                        <Qty value={row.opening} unit={row.unit} muted />
                        <Qty value={row.purchaseIn} unit={row.unit} tone="in" />
                        <Qty value={row.transferIn} unit={row.unit} tone="in" />
                        <Qty value={row.returnIn} unit={row.unit} tone="in" />
                        <Qty value={row.transferOut} unit={row.unit} tone="out" />
                        <Qty value={row.consumption} unit={row.unit} tone="out" />
                        <Qty value={row.wastage} unit={row.unit} tone="warn" />
                        <Qty value={row.returnOut} unit={row.unit} tone="out" />
                        <td
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            adjustment === 0 ? 'text-espresso-300' : 'text-chilli-600',
                          )}
                        >
                          {adjustment === 0 ? '—' : `${adjustment > 0 ? '+' : ''}${formatQuantity(adjustment, row.unit)}`}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-espresso-900">
                          {formatQuantity(row.closing, row.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-espresso-600">
                          {formatMoney(row.closingValue, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-espresso-400">
              Opening + everything in − everything out = closing. If the shelf disagrees, record a stock count on the
              Inventory page and the difference is written to the ledger with a reason.
            </p>
          </section>
        ))
      )}
    </div>
  );
}

function Qty({
  value,
  unit,
  tone,
  muted,
}: {
  value: number;
  unit: string;
  tone?: 'in' | 'out' | 'warn';
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 text-right tabular-nums',
        value === 0
          ? 'text-espresso-300'
          : muted
            ? 'text-espresso-600'
            : tone === 'in'
              ? 'text-basil-600'
              : tone === 'warn'
                ? 'text-saffron-700'
                : 'text-espresso-700',
      )}
    >
      {value === 0 ? '—' : formatQuantity(value, unit)}
    </td>
  );
}
