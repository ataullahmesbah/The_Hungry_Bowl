'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney, formatDateTime, type CurrencyConfig } from '@/lib/format';

export interface ReceiptSnapshot {
  restaurant: {
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    taxRegNumber: string | null;
    currencySymbol: string;
    currencyCode: string;
    currencyPosition: string;
    currencyDecimals: number;
    locale: string;
    timezone: string;
  };
  order: {
    orderNumber: string;
    secretCode: string;
    sessionCode: string | null;
    table: string | null;
    type: string;
    guestName: string | null;
    guestCount: number;
    createdAt: string;
    completedAt: string | null;
    note: string | null;
  };
  items: {
    name: string;
    variant: string | null;
    quantity: number;
    unitPrice: number;
    addOns: { name: string; price: number }[];
    lineTotal: number;
    note: string | null;
  }[];
  totals: {
    subtotal: number;
    discountAmount: number;
    discountReason: string | null;
    serviceChargePercent: number;
    serviceChargeAmount: number;
    taxLabel: string;
    taxPercent: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
  };
  payments: {
    method: string;
    amount: number;
    reference: string;
    maskedAccount: string | null;
    receivedAt: string;
    refunded: number;
  }[];
  issuedBy: string;
  issuedAt: string;
}

export function ReceiptSheet({
  snapshot,
  receiptNo,
  isReprint,
  orderId,
}: {
  snapshot: ReceiptSnapshot;
  receiptNo: string;
  isReprint: boolean;
  orderId: string;
}) {
  const currency: CurrencyConfig = {
    currencySymbol: snapshot.restaurant.currencySymbol,
    currencyPosition: snapshot.restaurant.currencyPosition,
    currencyDecimals: snapshot.restaurant.currencyDecimals,
    locale: snapshot.restaurant.locale,
    currencyCode: snapshot.restaurant.currencyCode,
  };
  const tz = snapshot.restaurant.timezone;

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href={`/dashboard/orders/${orderId}`} className="inline-flex items-center gap-1.5 text-sm text-espresso-500 hover:text-espresso-800">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the order
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="print-sheet rounded-[--radius-card] border border-espresso-100 bg-white p-6 font-mono text-[13px] leading-relaxed text-espresso-900 shadow-sm">
        <header className="text-center">
          <h1 className="font-[family-name:--font-display] text-lg font-bold uppercase tracking-wide">
            {snapshot.restaurant.name}
          </h1>
          {snapshot.restaurant.address ? <p className="mt-1 text-[11px]">{snapshot.restaurant.address}</p> : null}
          {snapshot.restaurant.phone ? <p className="text-[11px]">{snapshot.restaurant.phone}</p> : null}
          {snapshot.restaurant.taxRegNumber ? (
            <p className="text-[11px]">Reg: {snapshot.restaurant.taxRegNumber}</p>
          ) : null}
        </header>

        <div className="my-3 border-t border-dashed border-espresso-300" />

        <dl className="space-y-0.5 text-[11px]">
          <Line label="Receipt" value={receiptNo} />
          <Line label="Order" value={`#${snapshot.order.orderNumber} · ${snapshot.order.secretCode}`} />
          {snapshot.order.table ? <Line label="Table" value={snapshot.order.table} /> : null}
          {snapshot.order.guestName ? <Line label="Guest" value={snapshot.order.guestName} /> : null}
          <Line label="Date" value={formatDateTime(snapshot.order.createdAt, tz, snapshot.restaurant.locale)} />
          <Line label="Served by" value={snapshot.issuedBy} />
        </dl>

        <div className="my-3 border-t border-dashed border-espresso-300" />

        <ul className="space-y-2">
          {snapshot.items.map((item, index) => (
            <li key={index}>
              <div className="flex justify-between gap-3">
                <span className="min-w-0">
                  {item.quantity}× {item.name}
                  {item.variant ? ` (${item.variant})` : ''}
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(item.lineTotal, currency)}</span>
              </div>
              {item.addOns.length > 0 ? (
                <p className="pl-4 text-[11px] text-espresso-500">
                  + {item.addOns.map((a) => a.name).join(', ')}
                </p>
              ) : null}
              {item.note ? <p className="pl-4 text-[11px] italic text-espresso-500">{item.note}</p> : null}
            </li>
          ))}
        </ul>

        <div className="my-3 border-t border-dashed border-espresso-300" />

        <dl className="space-y-0.5">
          <Line label="Subtotal" value={formatMoney(snapshot.totals.subtotal, currency)} />
          {snapshot.totals.discountAmount > 0 ? (
            <Line
              label={`Discount${snapshot.totals.discountReason ? ` (${snapshot.totals.discountReason})` : ''}`}
              value={`- ${formatMoney(snapshot.totals.discountAmount, currency)}`}
            />
          ) : null}
          {snapshot.totals.serviceChargeAmount > 0 ? (
            <Line
              label={`Service ${snapshot.totals.serviceChargePercent}%`}
              value={formatMoney(snapshot.totals.serviceChargeAmount, currency)}
            />
          ) : null}
          {snapshot.totals.taxAmount > 0 ? (
            <Line
              label={`${snapshot.totals.taxLabel} ${snapshot.totals.taxPercent}%`}
              value={formatMoney(snapshot.totals.taxAmount, currency)}
            />
          ) : null}
        </dl>

        <div className="my-2 border-t border-espresso-900" />

        <div className="flex justify-between gap-3 text-base font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatMoney(snapshot.totals.totalAmount, currency)}</span>
        </div>

        {snapshot.payments.length > 0 ? (
          <>
            <div className="my-3 border-t border-dashed border-espresso-300" />
            <dl className="space-y-0.5 text-[11px]">
              {snapshot.payments.map((payment, index) => (
                <Line
                  key={index}
                  label={`${payment.method}${payment.reference !== '—' ? ` ${payment.reference}` : ''}${payment.maskedAccount ? ` ${payment.maskedAccount}` : ''}`}
                  value={formatMoney(payment.amount, currency)}
                />
              ))}
              {snapshot.totals.dueAmount > 0 ? (
                <Line label="STILL DUE" value={formatMoney(snapshot.totals.dueAmount, currency)} />
              ) : null}
            </dl>
          </>
        ) : null}

        <div className="my-3 border-t border-dashed border-espresso-300" />

        <footer className="text-center text-[11px]">
          {isReprint ? <p className="mb-1 font-bold uppercase">— Reprint —</p> : null}
          <p>Thank you for dining with us.</p>
          <p className="mt-1 text-espresso-400">
            {formatDateTime(snapshot.issuedAt, tz, snapshot.restaurant.locale)}
          </p>
        </footer>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
