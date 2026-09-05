'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Search } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/field';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { formatDateTime, formatMoney, formatQuantity, type CurrencyConfig } from '@/lib/format';

interface Movement {
  id: string;
  type: string;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  reason: string | null;
  note: string | null;
  referenceNo: string | null;
  createdAt: string;
  item: { id: string; name: string; unit: { code: string } };
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
}

const TYPE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PURCHASE_RECEIVE: 'success',
  TRANSFER: 'info',
  CONSUMPTION: 'neutral',
  RETURN: 'info',
  WASTAGE: 'danger',
  ADJUSTMENT: 'warning',
  OPENING: 'neutral',
};

const TYPE_LABEL: Record<string, string> = {
  PURCHASE_RECEIVE: 'received',
  TRANSFER: 'transfer',
  CONSUMPTION: 'consumed',
  RETURN: 'return',
  WASTAGE: 'wastage',
  ADJUSTMENT: 'adjustment',
  OPENING: 'opening',
};

export function MovementsTable({
  movements,
  currency,
  timezone,
  locale,
}: {
  movements: Movement[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (type && m.type !== type) return false;
      if (!q) return true;
      return (
        m.item.name.toLowerCase().includes(q) ||
        m.reason?.toLowerCase().includes(q) ||
        m.referenceNo?.toLowerCase().includes(q)
      );
    });
  }, [movements, search, type]);

  const columns: Column<Movement>[] = [
    {
      key: 'type',
      header: 'Movement',
      render: (m) => (
        <div>
          <Badge tone={TYPE_TONE[m.type] ?? 'neutral'}>{TYPE_LABEL[m.type] ?? m.type.toLowerCase()}</Badge>
          {m.referenceNo ? <p className="mt-0.5 font-mono text-[11px] text-espresso-400">{m.referenceNo}</p> : null}
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      render: (m) => (
        <div>
          <p className="font-medium text-espresso-900">{m.item.name}</p>
          {m.reason ? <p className="text-xs text-espresso-400">{m.reason}</p> : null}
        </div>
      ),
    },
    {
      key: 'route',
      header: 'From → to',
      render: (m) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-espresso-600">
          {m.fromWarehouse ? (
            <>
              <ArrowUp className="h-3 w-3 text-chilli-500" />
              {m.fromWarehouse.name}
            </>
          ) : null}
          {m.fromWarehouse && m.toWarehouse ? <ArrowLeftRight className="h-3 w-3 text-espresso-300" /> : null}
          {m.toWarehouse ? (
            <>
              <ArrowDown className="h-3 w-3 text-basil-500" />
              {m.toWarehouse.name}
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      render: (m) => (
        <span className="font-medium tabular-nums text-espresso-900">
          {formatQuantity(m.quantity, m.item.unit.code)}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (m) => (
        <span className="tabular-nums text-espresso-500">
          {m.totalCost != null ? formatMoney(m.totalCost, currency) : '—'}
        </span>
      ),
    },
    {
      key: 'when',
      header: 'When',
      align: 'right',
      render: (m) => (
        <span className="text-xs text-espresso-400">{formatDateTime(m.createdAt, timezone, locale)}</span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, reason or reference" className="pl-8" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Filter by type">
          <option value="">All movements</option>
          {Object.entries(TYPE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <DataTable columns={columns} rows={filtered} emptyMessage="No stock movements recorded yet." />
    </>
  );
}
