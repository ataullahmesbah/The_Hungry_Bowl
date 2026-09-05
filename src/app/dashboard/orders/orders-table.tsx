'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/field';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { formatDateTime, formatMoney, type CurrencyConfig } from '@/lib/format';

interface Order {
  id: string;
  orderNumber: string;
  secretCode: string;
  type: string;
  status: string;
  paymentState: string;
  totalAmount: number;
  dueAmount: number;
  guestName: string | null;
  createdAt: string;
  table: { name: string } | null;
  session: { code: string } | null;
  customer: { name: string } | null;
  _count: { items: number };
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  PLACED: 'info',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'success',
  SERVED: 'neutral',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function OrdersTable({
  orders,
  currency,
  timezone,
  locale,
  initialStatus,
}: {
  orders: Order[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(q) ||
        order.secretCode.toLowerCase() === q ||
        order.table?.name.toLowerCase().includes(q) ||
        order.guestName?.toLowerCase().includes(q) ||
        order.customer?.name.toLowerCase().includes(q),
    );
  }, [orders, search]);

  const columns: Column<Order>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (order) => (
        <div>
          <p className="font-medium text-espresso-900">
            #{order.orderNumber}
            <span className="ml-2 rounded bg-espresso-100 px-1.5 py-0.5 font-mono text-[11px] font-normal text-espresso-600">
              {order.secretCode}
            </span>
          </p>
          <p className="text-xs text-espresso-400">
            {order._count.items} item{order._count.items === 1 ? '' : 's'} ·{' '}
            {order.type === 'DINE_IN' ? 'dine-in' : order.type.toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      key: 'where',
      header: 'Table / guest',
      render: (order) => (
        <div>
          <p className="text-espresso-700">{order.table?.name ?? '—'}</p>
          <p className="text-xs text-espresso-400">
            {order.customer?.name ?? order.guestName ?? (order.session ? `session ${order.session.code}` : '—')}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status.toLowerCase()}</Badge>,
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (order) => (
        <div>
          <Badge
            tone={
              order.paymentState === 'PAID'
                ? 'success'
                : order.paymentState === 'PARTIALLY_PAID'
                  ? 'warning'
                  : order.paymentState === 'REFUNDED' || order.paymentState === 'VOIDED'
                    ? 'danger'
                    : 'neutral'
            }
          >
            {order.paymentState.toLowerCase().replace('_', ' ')}
          </Badge>
          {order.dueAmount > 0 ? (
            <p className="mt-0.5 text-xs text-chilli-600">due {formatMoney(order.dueAmount, currency)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (order) => (
        <span className="font-medium tabular-nums text-espresso-900">{formatMoney(order.totalAmount, currency)}</span>
      ),
    },
    {
      key: 'time',
      header: 'Placed',
      align: 'right',
      render: (order) => (
        <span className="text-xs text-espresso-400">{formatDateTime(order.createdAt, timezone, locale)}</span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, secret code, table or guest"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            router.push(e.target.value ? `/dashboard/orders?status=${e.target.value}` : '/dashboard/orders');
          }}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All orders</option>
          <option value="active">In service</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="DRAFT">Drafts</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage="No orders match this view."
        onRowClick={(order) => router.push(`/dashboard/orders/${order.id}`)}
      />
    </>
  );
}
