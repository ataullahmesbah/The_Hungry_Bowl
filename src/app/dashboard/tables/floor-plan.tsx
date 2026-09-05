'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Armchair, Clock, LogOut, Plus, Receipt, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { elapsedLabel, formatMoney, formatTime, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

interface SessionInfo {
  id: string;
  code: string;
  guestCount: number;
  guestName: string | null;
  customerName: string | null;
  openedAt: string;
  orders: { id: string; orderNumber: string; secretCode: string; status: string }[];
  totals: { orderCount: number; total: number; paid: number; due: number; hasUnpaid: boolean; hasOpenOrders: boolean };
}

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'MAINTENANCE';
  shape: string;
  isActive: boolean;
  notes: string | null;
  area: { id: string; name: string; floor: string | null } | null;
  session: SessionInfo | null;
}

const STATUS_STYLES: Record<TableRow['status'], string> = {
  FREE: 'border-espresso-200 bg-white hover:border-basil-400',
  OCCUPIED: 'border-saffron-400 bg-saffron-50',
  RESERVED: 'border-blue-300 bg-blue-50',
  CLEANING: 'border-espresso-300 bg-espresso-100',
  MAINTENANCE: 'border-espresso-200 bg-espresso-50 opacity-60',
};

const STATUS_LABEL: Record<TableRow['status'], string> = {
  FREE: 'Free',
  OCCUPIED: 'Occupied',
  RESERVED: 'Reserved',
  CLEANING: 'Cleaning',
  MAINTENANCE: 'Maintenance',
};

export function FloorPlan({
  tables,
  areas,
  customers,
  currency,
  timezone,
  locale,
  canManageSessions,
  canCreateOrders,
  canRecordPayments,
}: {
  tables: TableRow[];
  areas: { id: string; name: string; floor: string | null }[];
  customers: { id: string; name: string; phone: string | null }[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  canManageSessions: boolean;
  canCreateOrders: boolean;
  canRecordPayments: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [areaFilter, setAreaFilter] = useState('');
  const [seating, setSeating] = useState<TableRow | null>(null);
  const [clearing, setClearing] = useState<TableRow | null>(null);

  const counts = useMemo(() => {
    const out = { total: 0, free: 0, occupied: 0, reserved: 0, other: 0 };
    for (const table of tables) {
      if (!table.isActive) continue;
      out.total += 1;
      if (table.status === 'FREE') out.free += 1;
      else if (table.status === 'OCCUPIED') out.occupied += 1;
      else if (table.status === 'RESERVED') out.reserved += 1;
      else out.other += 1;
    }
    return out;
  }, [tables]);

  const grouped = useMemo(() => {
    const filtered = areaFilter ? tables.filter((t) => t.area?.id === areaFilter) : tables;
    const map = new Map<string, { name: string; tables: TableRow[] }>();
    for (const table of filtered) {
      const key = table.area?.id ?? 'none';
      if (!map.has(key)) map.set(key, { name: table.area?.name ?? 'Unassigned', tables: [] });
      map.get(key)!.tables.push(table);
    }
    return [...map.values()];
  }, [tables, areaFilter]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Tables', value: counts.total, tone: 'neutral' as const },
          { label: 'Free', value: counts.free, tone: 'success' as const },
          { label: 'Occupied', value: counts.occupied, tone: 'warning' as const },
          { label: 'Reserved', value: counts.reserved, tone: 'info' as const },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[--radius-card] border border-espresso-100 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-espresso-400">{stat.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-espresso-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {areas.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setAreaFilter('')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm transition-colors',
              !areaFilter ? 'bg-espresso-900 font-medium text-cream-50' : 'text-espresso-600 hover:bg-cream-200',
            )}
          >
            All areas
          </button>
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setAreaFilter(area.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                areaFilter === area.id ? 'bg-espresso-900 font-medium text-cream-50' : 'text-espresso-600 hover:bg-cream-200',
              )}
            >
              {area.name}
            </button>
          ))}
        </div>
      ) : null}

      {grouped.map((group) => (
        <section key={group.name}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-espresso-400">{group.name}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.tables.map((table) => (
              <article
                key={table.id}
                className={cn('rounded-[--radius-card] border-2 p-4 transition-colors', STATUS_STYLES[table.status])}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-espresso-900">{table.name}</h3>
                    <p className="flex items-center gap-1 text-xs text-espresso-400">
                      <Armchair className="h-3 w-3" />
                      {table.capacity} seats
                    </p>
                  </div>
                  <Badge
                    tone={
                      table.status === 'FREE'
                        ? 'success'
                        : table.status === 'OCCUPIED'
                          ? 'warning'
                          : table.status === 'RESERVED'
                            ? 'info'
                            : 'neutral'
                    }
                  >
                    {STATUS_LABEL[table.status]}
                  </Badge>
                </div>

                {table.session ? (
                  <div className="mt-3 space-y-2.5 border-t border-espresso-200/60 pt-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1 text-espresso-600">
                        <Users className="h-3.5 w-3.5" />
                        {table.session.guestCount} guest{table.session.guestCount === 1 ? '' : 's'}
                      </span>
                      <span className="flex items-center gap-1 text-espresso-500">
                        <Clock className="h-3.5 w-3.5" />
                        {elapsedLabel(table.session.openedAt)}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-espresso-900">
                      {table.session.customerName ?? table.session.guestName ?? 'Walk-in'}
                      <span className="ml-2 rounded bg-espresso-900/10 px-1.5 py-0.5 font-mono text-[11px] text-espresso-600">
                        {table.session.code}
                      </span>
                    </p>

                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-espresso-500">
                        {table.session.totals.orderCount} order{table.session.totals.orderCount === 1 ? '' : 's'}
                      </span>
                      <span className="font-semibold tabular-nums text-espresso-900">
                        {formatMoney(table.session.totals.total, currency)}
                      </span>
                    </div>

                    {table.session.totals.due > 0 ? (
                      <p className="rounded bg-chilli-500/10 px-2 py-1 text-xs font-medium text-chilli-600">
                        Due {formatMoney(table.session.totals.due, currency)}
                      </p>
                    ) : table.session.totals.orderCount > 0 ? (
                      <p className="rounded bg-basil-500/10 px-2 py-1 text-xs font-medium text-basil-600">Fully paid</p>
                    ) : null}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {canCreateOrders ? (
                        <Link href={`/dashboard/orders/new?session=${table.session.id}`}>
                          <Button size="sm" variant="accent">
                            <Plus className="h-3.5 w-3.5" />
                            Add order
                          </Button>
                        </Link>
                      ) : null}
                      <Link href={`/dashboard/tables/${table.session.id}`}>
                        <Button size="sm" variant="outline">
                          <Receipt className="h-3.5 w-3.5" />
                          Bill
                        </Button>
                      </Link>
                      {canManageSessions ? (
                        <Button size="sm" variant="ghost" onClick={() => setClearing(table)}>
                          <LogOut className="h-3.5 w-3.5" />
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-espresso-200/60 pt-3">
                    {table.status === 'MAINTENANCE' ? (
                      <p className="text-xs text-espresso-400">Out of service.</p>
                    ) : canManageSessions ? (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setSeating(table)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Seat guests
                      </Button>
                    ) : (
                      <p className="text-xs text-espresso-400">Free</p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {seating ? (
        <SeatDialog
          table={seating}
          customers={customers}
          onClose={() => setSeating(null)}
          onDone={() => {
            setSeating(null);
            toast.success('Guests seated');
            router.refresh();
          }}
        />
      ) : null}

      {clearing?.session ? (
        <ClearDialog
          table={clearing}
          currency={currency}
          canForce={canRecordPayments}
          timezone={timezone}
          locale={locale}
          onClose={() => setClearing(null)}
          onDone={() => {
            setClearing(null);
            toast.success('Table cleared');
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SeatDialog({
  table,
  customers,
  onClose,
  onDone,
}: {
  table: TableRow;
  customers: { id: string; name: string; phone: string | null }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [guestCount, setGuestCount] = useState(String(Math.min(2, table.capacity)));
  const [customerId, setCustomerId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.post('/api/table-sessions', {
        tableId: table.id,
        guestCount: Number(guestCount),
        customerId: customerId || null,
        guestName: guestName.trim() || null,
        guestPhone: guestPhone.trim() || null,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not seat this party.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`Seat guests at ${table.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <Alert tone="info">
          This starts a new bill for this party. Everything they order goes on it, and the next party to sit here will
          get a separate bill of their own.
        </Alert>

        <Field label="Number of guests" required>
          <Select value={guestCount} onChange={(e) => setGuestCount(e.target.value)}>
            {Array.from({ length: Math.max(table.capacity, 12) }).map((_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
                {index + 1 > table.capacity ? ' (over capacity)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Existing customer" hint="Optional — links the visit to their history.">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in guest</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {!customerId ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest name" hint="Optional">
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Phone" hint="Optional">
              <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} maxLength={24} />
            </Field>
          </div>
        ) : null}

        <Field label="Note" hint="Birthday, high chair, allergy — anything the team should know.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : <UserPlus className="h-4 w-4" />}
            Seat guests
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ClearDialog({
  table,
  currency,
  canForce,
  timezone,
  locale,
  onClose,
  onDone,
}: {
  table: TableRow;
  currency: CurrencyConfig;
  canForce: boolean;
  timezone: string;
  locale: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const session = table.session!;
  const [markForCleaning, setMarkForCleaning] = useState(true);
  const [force, setForce] = useState(false);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const blocked = session.totals.hasUnpaid || session.totals.hasOpenOrders;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await api.patch(`/api/table-sessions/${session.id}/close`, {
        markForCleaning,
        notes: notes.trim() || null,
        forceWithUnpaid: force,
      });
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not clear the table.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`Clear ${table.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <div className="rounded-lg border border-espresso-100 bg-cream-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-espresso-500">Seated at</span>
            <span className="text-espresso-900">{formatTime(session.openedAt, timezone, locale)}</span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3">
            <span className="text-espresso-500">Orders</span>
            <span className="text-espresso-900">{session.totals.orderCount}</span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3">
            <span className="text-espresso-500">Bill total</span>
            <span className="font-semibold text-espresso-900">{formatMoney(session.totals.total, currency)}</span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3">
            <span className="text-espresso-500">Paid</span>
            <span className="text-espresso-900">{formatMoney(session.totals.paid, currency)}</span>
          </div>
          {session.totals.due > 0 ? (
            <div className="mt-1.5 flex justify-between gap-3 border-t border-espresso-200 pt-1.5">
              <span className="font-medium text-chilli-600">Outstanding</span>
              <span className="font-semibold text-chilli-600">{formatMoney(session.totals.due, currency)}</span>
            </div>
          ) : null}
        </div>

        {blocked ? (
          <Alert tone="warning" title="This table is not settled">
            {session.totals.hasOpenOrders
              ? 'Some orders are still with the kitchen or waiting to be served. '
              : ''}
            {session.totals.hasUnpaid ? 'There is money still outstanding. ' : ''}
            Record the payment first, or use the override below.
          </Alert>
        ) : null}

        {blocked && canForce ? (
          <label className="flex items-start gap-2.5 rounded-lg border border-chilli-500/30 bg-red-50 p-3 text-sm">
            <Checkbox className="mt-0.5" checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span className="text-espresso-700">
              <span className="block font-medium text-chilli-700">Close anyway (manager override)</span>
              <span className="block text-xs text-espresso-500">
                This is recorded in the audit log and finance is notified.
              </span>
            </span>
          </label>
        ) : null}

        <label className="flex items-center gap-2.5 text-sm text-espresso-700">
          <Checkbox checked={markForCleaning} onChange={(e) => setMarkForCleaning(e.target.checked)} />
          Mark the table for cleaning instead of free
        </label>

        <Field label="Note" hint="Optional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" variant={blocked ? 'danger' : 'primary'} disabled={pending || (blocked && !force)}>
            {pending ? <Spinner /> : <LogOut className="h-4 w-4" />}
            Clear table
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    </div>
  );
}
