'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ban, BadgePercent, CreditCard, Printer, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDateTime, formatMoney, maskReference, type CurrencyConfig } from '@/lib/format';

interface Payment {
  id: string;
  amount: number;
  status: string;
  reference: string | null;
  maskedAccount: string | null;
  tipAmount: number;
  refundedAmount: number;
  refundReason: string | null;
  voidReason: string | null;
  receivedAt: string;
  note: string | null;
  method: { id: string; name: string };
}

interface Order {
  id: string;
  orderNumber: string;
  secretCode: string;
  type: string;
  status: string;
  paymentState: string;
  note: string | null;
  guestName: string | null;
  subtotal: number;
  discountAmount: number;
  discountReason: string | null;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  createdAt: string;
  items: {
    id: string;
    itemName: string;
    variantName: string | null;
    unitPrice: number;
    quantity: number;
    cancelledQty: number;
    lineTotal: number;
    note: string | null;
    options: { id: string; addOnName: string; price: number }[];
  }[];
  table: { id: string; name: string } | null;
  session: { id: string; code: string; status: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  payments: Payment[];
  statusHistory: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[];
  kitchenTicket: { status: string; receivedAt: string; acceptedAt: string | null; readyAt: string | null } | null;
  receipts: { id: string; receiptNo: string; issuedAt: string }[];
}

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  DRAFT: [{ value: 'PLACED', label: 'Send to kitchen' }],
  PLACED: [{ value: 'ACCEPTED', label: 'Mark accepted' }],
  ACCEPTED: [{ value: 'PREPARING', label: 'Mark preparing' }],
  PREPARING: [{ value: 'READY', label: 'Mark ready' }],
  READY: [{ value: 'SERVED', label: 'Mark served' }],
  SERVED: [{ value: 'COMPLETED', label: 'Complete order' }],
};

export function OrderDetail({
  order,
  methods,
  currency,
  taxLabel,
  timezone,
  locale,
  can,
}: {
  order: Order;
  methods: { id: string; name: string; kind: string; requiresReference: boolean; instructions: string | null }[];
  currency: CurrencyConfig;
  taxLabel: string;
  timezone: string;
  locale: string;
  can: { edit: boolean; cancel: boolean; discount: boolean; pay: boolean; refund: boolean; voidPayment: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [voidFor, setVoidFor] = useState<Payment | null>(null);

  const closed = ['COMPLETED', 'CANCELLED'].includes(order.status);

  async function move(status: string, note?: string) {
    setPending(true);
    setMessage(null);
    try {
      await api.patch(`/api/orders/${order.id}/status`, { status, note: note ?? null });
      toast.success(`Order marked ${status.toLowerCase()}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not update the order.');
    } finally {
      setPending(false);
      setConfirmCancel(false);
    }
  }

  async function issueReceipt() {
    setPending(true);
    try {
      await api.post('/api/receipts', { orderId: order.id });
      toast.success('Receipt issued');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not issue the receipt');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Items</CardTitle>
              <p className="mt-0.5 text-xs text-espresso-400">
                Placed {formatDateTime(order.createdAt, timezone, locale)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone={order.status === 'COMPLETED' ? 'success' : order.status === 'CANCELLED' ? 'danger' : 'warning'}>
                {order.status.toLowerCase()}
              </Badge>
              {order.kitchenTicket ? (
                <Badge tone="info">kitchen: {order.kitchenTicket.status.toLowerCase()}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-espresso-100">
              {order.items.map((item) => {
                const active = item.quantity - item.cancelledQty;
                return (
                  <li key={item.id} className="flex justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-espresso-900">
                        <span className="font-medium tabular-nums">{active}×</span> {item.itemName}
                        {item.variantName ? <span className="text-espresso-500"> · {item.variantName}</span> : null}
                        {item.cancelledQty > 0 ? (
                          <span className="ml-2 text-xs text-chilli-600">({item.cancelledQty} cancelled)</span>
                        ) : null}
                      </p>
                      {item.options.length > 0 ? (
                        <p className="mt-0.5 text-xs text-espresso-400">
                          {item.options.map((o) => o.addOnName).join(', ')}
                        </p>
                      ) : null}
                      {item.note ? <p className="mt-0.5 text-xs italic text-saffron-700">“{item.note}”</p> : null}
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums text-espresso-900">
                      {formatMoney(item.lineTotal, currency)}
                    </p>
                  </li>
                );
              })}
            </ul>

            {order.note ? (
              <p className="mt-4 rounded-lg bg-saffron-50 px-4 py-2.5 text-sm text-saffron-900">
                <strong className="font-semibold">Note:</strong> {order.note}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            {can.pay && !closed && order.dueAmount > 0 ? (
              <Button size="sm" onClick={() => setShowPayment(true)}>
                <CreditCard className="h-3.5 w-3.5" />
                Record payment
              </Button>
            ) : null}
          </CardHeader>
          <CardBody>
            {order.payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-espresso-400">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-espresso-100">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-espresso-900">
                        {payment.method.name}
                        <Badge
                          tone={
                            payment.status === 'COMPLETED'
                              ? 'success'
                              : payment.status === 'VOIDED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {payment.status.toLowerCase()}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-xs text-espresso-400">
                        {formatDateTime(payment.receivedAt, timezone, locale)}
                        {payment.reference ? ` · ref ${maskReference(payment.reference)}` : ''}
                        {payment.maskedAccount ? ` · ••••${payment.maskedAccount.slice(-4)}` : ''}
                      </p>
                      {payment.refundedAmount > 0 ? (
                        <p className="mt-0.5 text-xs text-chilli-600">
                          Refunded {formatMoney(payment.refundedAmount, currency)}
                          {payment.refundReason ? ` — ${payment.refundReason}` : ''}
                        </p>
                      ) : null}
                      {payment.voidReason ? (
                        <p className="mt-0.5 text-xs text-chilli-600">Voided — {payment.voidReason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-espresso-900">
                        {formatMoney(payment.amount, currency)}
                      </span>
                      {can.refund && payment.status !== 'VOIDED' && payment.refundedAmount < payment.amount ? (
                        <Button size="sm" variant="ghost" onClick={() => setRefundFor(payment)}>
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {can.voidPayment && payment.status === 'COMPLETED' && payment.refundedAmount === 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => setVoidFor(payment)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {order.statusHistory.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2 text-sm">
                {order.statusHistory.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3">
                    <Badge tone="neutral">{entry.toStatus.toLowerCase()}</Badge>
                    <span className="text-xs text-espresso-400">
                      {formatDateTime(entry.createdAt, timezone, locale)}
                      {entry.note ? ` · ${entry.note}` : ''}
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
            <CardTitle>Bill</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal, currency)} />
              {order.discountAmount > 0 ? (
                <Row
                  label={`Discount${order.discountReason ? ` · ${order.discountReason}` : ''}`}
                  value={`− ${formatMoney(order.discountAmount, currency)}`}
                />
              ) : null}
              {order.serviceChargeAmount > 0 ? (
                <Row label={`Service ${order.serviceChargePercent}%`} value={formatMoney(order.serviceChargeAmount, currency)} />
              ) : null}
              {order.taxAmount > 0 ? (
                <Row label={`${taxLabel} ${order.taxPercent}%`} value={formatMoney(order.taxAmount, currency)} />
              ) : null}
              <div className="border-t border-espresso-100 pt-1.5">
                <Row label="Total" value={formatMoney(order.totalAmount, currency)} strong />
              </div>
              <Row label="Paid" value={formatMoney(order.paidAmount, currency)} />
              {order.dueAmount > 0 ? <Row label="Due" value={formatMoney(order.dueAmount, currency)} danger /> : null}
            </dl>

            <div className="space-y-2 border-t border-espresso-100 pt-3">
              {!closed &&
                (NEXT_STATUS[order.status] ?? []).map((next) => (
                  <Button
                    key={next.value}
                    className="w-full"
                    disabled={pending || !can.edit}
                    onClick={() => void move(next.value)}
                  >
                    {pending ? <Spinner /> : null}
                    {next.label}
                  </Button>
                ))}

              {can.pay && !closed && order.dueAmount > 0 ? (
                <Button variant="accent" className="w-full" onClick={() => setShowPayment(true)}>
                  <CreditCard className="h-4 w-4" />
                  Record payment
                </Button>
              ) : null}

              {can.discount && !closed ? (
                <Button variant="outline" className="w-full" onClick={() => setShowDiscount(true)}>
                  <BadgePercent className="h-4 w-4" />
                  Apply discount
                </Button>
              ) : null}

              <Button variant="outline" className="w-full" onClick={() => void issueReceipt()} disabled={pending}>
                <Printer className="h-4 w-4" />
                {order.receipts.length > 0 ? 'Reprint receipt' : 'Issue receipt'}
              </Button>

              {can.cancel && !closed ? (
                <Button
                  variant="ghost"
                  className="w-full text-chilli-600 hover:bg-red-50"
                  onClick={() => setConfirmCancel(true)}
                  disabled={pending}
                >
                  <Ban className="h-4 w-4" />
                  Cancel order
                </Button>
              ) : null}
            </div>

            {order.session ? (
              <Link href={`/dashboard/tables/${order.session.id}`} className="block pt-1">
                <Button variant="ghost" className="w-full">
                  View the whole table bill
                </Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>

        {order.receipts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-1.5 text-sm">
                {order.receipts.map((receipt) => (
                  <li key={receipt.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/orders/${order.id}/receipt/${receipt.id}`} className="font-mono text-xs text-saffron-700 hover:underline">
                      {receipt.receiptNo}
                    </Link>
                    <span className="text-xs text-espresso-400">
                      {formatDateTime(receipt.issuedAt, timezone, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </aside>

      {showPayment ? (
        <PaymentDialog
          order={order}
          methods={methods}
          currency={currency}
          onClose={() => setShowPayment(false)}
          onDone={() => {
            setShowPayment(false);
            toast.success('Payment recorded');
            router.refresh();
          }}
        />
      ) : null}

      {showDiscount ? (
        <DiscountDialog
          order={order}
          currency={currency}
          onClose={() => setShowDiscount(false)}
          onDone={() => {
            setShowDiscount(false);
            toast.success('Discount applied');
            router.refresh();
          }}
        />
      ) : null}

      {refundFor ? (
        <RefundDialog
          payment={refundFor}
          currency={currency}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            toast.success('Refund recorded');
            router.refresh();
          }}
        />
      ) : null}

      {voidFor ? (
        <VoidDialog
          payment={voidFor}
          currency={currency}
          onClose={() => setVoidFor(null)}
          onDone={() => {
            setVoidFor(null);
            toast.success('Payment voided');
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        title={`Cancel order #${order.orderNumber}?`}
        confirmLabel="Cancel order"
        pending={pending}
        description="The kitchen ticket is cancelled too. An order that has already been paid must be refunded first."
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void move('CANCELLED', 'Cancelled from the order screen')}
      />
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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-md overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    </div>
  );
}

function PaymentDialog({
  order,
  methods,
  currency,
  onClose,
  onDone,
}: {
  order: Order;
  methods: { id: string; name: string; kind: string; requiresReference: boolean; instructions: string | null }[];
  currency: CurrencyConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [amount, setAmount] = useState(order.dueAmount.toFixed(2));
  const [reference, setReference] = useState('');
  const [maskedAccount, setMaskedAccount] = useState('');
  const [tip, setTip] = useState('0');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const method = methods.find((m) => m.id === methodId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      await api.post('/api/payments', {
        orderId: order.id,
        methodId,
        amount: Number(amount),
        reference: reference.trim() || null,
        maskedAccount: maskedAccount.trim() || null,
        tipAmount: Number(tip) || 0,
        note: note.trim() || null,
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not record the payment.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`Record payment · order #${order.orderNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <div className="rounded-lg bg-cream-100 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-espresso-500">Order total</span>
            <span className="font-medium tabular-nums">{formatMoney(order.totalAmount, currency)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-espresso-500">Outstanding</span>
            <span className="font-semibold tabular-nums text-chilli-600">{formatMoney(order.dueAmount, currency)}</span>
          </div>
        </div>

        <Field label="Method" required error={errors.methodId}>
          <Select value={methodId} onChange={(e) => setMethodId(e.target.value)} required>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>

        {method?.instructions ? <Alert tone="info">{method.instructions}</Alert> : null}

        <Field label="Amount received" required error={errors.amount}>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </Field>

        <Field
          label="Transaction reference"
          required={method?.requiresReference}
          error={errors.reference}
          hint={method?.requiresReference ? 'Required for this method — from the terminal or the customer’s SMS.' : 'Optional'}
        >
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </Field>

        {method?.kind === 'CARD' ? (
          <Field
            label="Last 4 digits of the card"
            error={errors.maskedAccount}
            hint="Digits only. Never type the full card number — this system has no field for one."
          >
            <Input
              value={maskedAccount}
              onChange={(e) => setMaskedAccount(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
            />
          </Field>
        ) : null}

        <Field label="Tip" error={errors.tipAmount} hint="Optional">
          <Input type="number" min="0" step="0.01" value={tip} onChange={(e) => setTip(e.target.value)} />
        </Field>

        <Field label="Note" hint="Optional">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <CreditCard className="h-4 w-4" />}
            Record payment
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DiscountDialog({
  order,
  currency,
  onClose,
  onDone,
}: {
  order: Order;
  currency: CurrencyConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(order.discountAmount || ''));
  const [reason, setReason] = useState(order.discountReason ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.patch(`/api/orders/${order.id}/discount`, {
        discountAmount: Number(amount) || 0,
        discountReason: reason.trim() || null,
      });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not apply the discount.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Apply a discount" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <Alert tone="warning">
          Discounts are recorded in the audit log against your name. Subtotal is{' '}
          {formatMoney(order.subtotal, currency)}.
        </Alert>

        <Field label="Discount amount" required>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>

        <Field label="Reason" hint="Manager comp, loyalty, service issue…">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Apply discount
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RefundDialog({
  payment,
  currency,
  onClose,
  onDone,
}: {
  payment: Payment;
  currency: CurrencyConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const refundable = payment.amount - payment.refundedAmount;
  const [amount, setAmount] = useState(refundable.toFixed(2));
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.post(`/api/payments/${payment.id}/refund`, { amount: Number(amount), reason: reason.trim() });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not record the refund.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`Refund ${payment.method.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <Alert tone="info">
          The original payment of {formatMoney(payment.amount, currency)} stays on the record. The refund is added
          beside it, so both are visible in the history.
        </Alert>

        <Field label="Refund amount" required hint={`At most ${formatMoney(refundable, currency)}`}>
          <Input type="number" min="0.01" step="0.01" max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>

        <Field label="Reason" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? <Spinner /> : <RotateCcw className="h-4 w-4" />}
            Record refund
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function VoidDialog({
  payment,
  currency,
  onClose,
  onDone,
}: {
  payment: Payment;
  currency: CurrencyConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.post(`/api/payments/${payment.id}/void`, { reason: reason.trim() });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not void the payment.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Void this payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <Alert tone="warning">
          Voiding is for a payment entered in error — a wrong table or a duplicate. Use a refund if money actually went
          back to the customer. {formatMoney(payment.amount, currency)} will be removed from the order total, and
          finance is notified.
        </Alert>

        <Field label="Reason" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} autoFocus />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? <Spinner /> : <Ban className="h-4 w-4" />}
            Void payment
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
