'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/field';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { formatDateTime, formatMoney, maskReference, type CurrencyConfig } from '@/lib/format';

interface PaymentRow {
  id: string;
  amount: number;
  refundedAmount: number;
  status: string;
  reference: string | null;
  maskedAccount: string | null;
  receivedAt: string;
  method: { id: string; name: string; kind: string };
  order: { id: string; orderNumber: string; secretCode: string; table: { name: string } | null };
}

export function PaymentsTable({
  payments,
  currency,
  timezone,
  locale,
}: {
  payments: PaymentRow[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.order.orderNumber.toLowerCase().includes(q) ||
        p.order.secretCode.toLowerCase() === q ||
        p.method.name.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q),
    );
  }, [payments, search]);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (payment) => (
        <div>
          <p className="font-medium text-espresso-900">#{payment.order.orderNumber}</p>
          <p className="text-xs text-espresso-400">
            {payment.order.table?.name ?? 'takeaway'} · {payment.order.secretCode}
          </p>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (payment) => (
        <div>
          <p className="text-espresso-700">{payment.method.name}</p>
          {payment.reference || payment.maskedAccount ? (
            <p className="text-xs text-espresso-400">
              {/* References are masked in every list view — the full value is never displayed. */}
              {payment.reference ? maskReference(payment.reference) : ''}
              {payment.maskedAccount ? ` ••••${payment.maskedAccount.slice(-4)}` : ''}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (payment) => (
        <Badge
          tone={
            payment.status === 'COMPLETED'
              ? 'success'
              : payment.status === 'VOIDED'
                ? 'danger'
                : payment.status === 'REFUNDED'
                  ? 'warning'
                  : 'neutral'
          }
        >
          {payment.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (payment) => (
        <div>
          <p className="font-medium tabular-nums text-espresso-900">{formatMoney(payment.amount, currency)}</p>
          {payment.refundedAmount > 0 ? (
            <p className="text-xs text-chilli-600">− {formatMoney(payment.refundedAmount, currency)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'time',
      header: 'Received',
      align: 'right',
      render: (payment) => (
        <span className="text-xs text-espresso-400">{formatDateTime(payment.receivedAt, timezone, locale)}</span>
      ),
    },
  ];

  return (
    <>
      <div className="border-b border-espresso-100 px-5 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, code, method or reference"
            className="pl-8"
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage="No payments recorded today."
        onRowClick={(payment) => router.push(`/dashboard/orders/${payment.order.id}`)}
      />
    </>
  );
}
