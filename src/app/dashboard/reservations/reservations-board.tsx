'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Phone, Plus, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Reservation {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  guestCount: number;
  reservedAt: string;
  durationMinutes: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  note: string | null;
  internalNote: string | null;
  source: string;
  table: { id: string; name: string; capacity: number } | null;
  customer: { id: string; name: string } | null;
  session: { id: string; code: string } | null;
}

const STATUS_TONE: Record<Reservation['status'], 'warning' | 'success' | 'danger' | 'neutral' | 'info'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'info',
  NO_SHOW: 'danger',
};

const FILTERS = ['', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;

export function ReservationsBoard({
  reservations,
  tables,
  timezone,
  locale,
  phoneCode,
  initialStatus,
  canManage,
  canSeat,
}: {
  reservations: Reservation[];
  tables: { id: string; name: string; capacity: number }[];
  timezone: string;
  locale: string;
  phoneCode: string;
  initialStatus: string;
  canManage: boolean;
  canSeat: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState(initialStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(
    () => (filter ? reservations.filter((r) => r.status === filter) : reservations),
    [reservations, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of visible) {
      const key = formatDate(reservation.reservedAt, timezone, locale);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(reservation);
    }
    return [...map.entries()];
  }, [visible, timezone, locale]);

  async function update(reservation: Reservation, body: Record<string, unknown>, successMessage: string) {
    setBusyId(reservation.id);
    try {
      await api.patch(`/api/reservations/${reservation.id}`, body);
      toast.success(successMessage);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the reservation');
    } finally {
      setBusyId(null);
    }
  }

  async function seat(reservation: Reservation) {
    if (!reservation.table) {
      toast.error('Assign a table first', 'Choose a table for this booking, then seat the guests.');
      return;
    }
    setBusyId(reservation.id);
    try {
      await api.post('/api/table-sessions', {
        tableId: reservation.table.id,
        guestCount: reservation.guestCount,
        customerId: reservation.customer?.id ?? null,
        guestName: reservation.name,
        guestPhone: reservation.phone,
        reservationId: reservation.id,
      });
      toast.success(`${reservation.name} seated at ${reservation.table.name}`);
      router.push('/dashboard/tables');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not seat this party');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((option) => (
            <button
              key={option || 'all'}
              type="button"
              onClick={() => setFilter(option)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                filter === option ? 'bg-espresso-900 font-medium text-cream-50' : 'text-espresso-600 hover:bg-cream-200',
              )}
            >
              {option ? option.charAt(0) + option.slice(1).toLowerCase() : 'All'}
              {option === 'PENDING' ? (
                <span className="ml-1.5 text-xs opacity-70">
                  {reservations.filter((r) => r.status === 'PENDING').length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canManage ? (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Take a booking
          </Button>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <Card>
          <p className="px-5 py-14 text-center text-sm text-espresso-400">No reservations to show.</p>
        </Card>
      ) : (
        grouped.map(([day, rows]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-semibold text-espresso-700">{day}</h2>
            <div className="space-y-3">
              {rows.map((reservation) => (
                <Card key={reservation.id}>
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold tabular-nums text-espresso-900">
                            {formatTime(reservation.reservedAt, timezone, locale)}
                          </span>
                          <span className="font-medium text-espresso-900">{reservation.name}</span>
                          <Badge tone={STATUS_TONE[reservation.status]}>{reservation.status.toLowerCase().replace('_', ' ')}</Badge>
                          <span className="rounded bg-espresso-100 px-1.5 py-0.5 font-mono text-[11px] text-espresso-600">
                            {reservation.code}
                          </span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-espresso-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {reservation.guestCount} guest{reservation.guestCount === 1 ? '' : 's'}
                          </span>
                          <a href={`tel:${reservation.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-saffron-700">
                            <Phone className="h-3.5 w-3.5" />
                            {reservation.phone}
                          </a>
                          {reservation.table ? <span>Table {reservation.table.name}</span> : null}
                          <span className="text-xs">via {reservation.source}</span>
                        </p>
                        {reservation.note ? (
                          <p className="mt-2 rounded bg-cream-100 px-3 py-1.5 text-sm text-espresso-600">
                            “{reservation.note}”
                          </p>
                        ) : null}
                      </div>

                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {['PENDING', 'CONFIRMED'].includes(reservation.status) ? (
                            <Select
                              value={reservation.table?.id ?? ''}
                              onChange={(e) =>
                                void update(reservation, { status: reservation.status, tableId: e.target.value || null }, 'Table assigned')
                              }
                              className="w-auto text-xs"
                              aria-label={`Table for ${reservation.name}`}
                              disabled={busyId === reservation.id}
                            >
                              <option value="">No table</option>
                              {tables.map((table) => (
                                <option key={table.id} value={table.id} disabled={table.capacity < reservation.guestCount}>
                                  {table.name} ({table.capacity})
                                </option>
                              ))}
                            </Select>
                          ) : null}

                          {reservation.status === 'PENDING' ? (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                disabled={busyId === reservation.id}
                                onClick={() => void update(reservation, { status: 'CONFIRMED' }, 'Reservation confirmed')}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === reservation.id}
                                onClick={() => void update(reservation, { status: 'REJECTED' }, 'Reservation rejected')}
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </>
                          ) : null}

                          {reservation.status === 'CONFIRMED' && canSeat && !reservation.session ? (
                            <Button size="sm" variant="accent" disabled={busyId === reservation.id} onClick={() => void seat(reservation)}>
                              <UserPlus className="h-3.5 w-3.5" />
                              Seat now
                            </Button>
                          ) : null}

                          {reservation.status === 'CONFIRMED' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === reservation.id}
                              onClick={() => void update(reservation, { status: 'NO_SHOW' }, 'Marked as no-show')}
                            >
                              No-show
                            </Button>
                          ) : null}

                          {['PENDING', 'CONFIRMED'].includes(reservation.status) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === reservation.id}
                              onClick={() => void update(reservation, { status: 'CANCELLED' }, 'Reservation cancelled')}
                            >
                              Cancel
                            </Button>
                          ) : null}

                          {reservation.session ? (
                            <Badge tone="info">seated · {reservation.session.code}</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

      {creating ? (
        <NewReservationDialog
          tables={tables}
          phoneCode={phoneCode}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast.success('Booking saved');
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function NewReservationDialog({
  tables,
  phoneCode,
  onClose,
  onDone,
}: {
  tables: { id: string; name: string; capacity: number }[];
  phoneCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState({
    name: '',
    phone: '',
    email: '',
    guestCount: '2',
    date: new Date().toISOString().slice(0, 10),
    time: '19:00',
    durationMinutes: '90',
    tableId: '',
    note: '',
    internalNote: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function set(key: keyof typeof values) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      await api.post('/api/reservations', {
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() || null,
        guestCount: Number(values.guestCount),
        reservedAt: new Date(`${values.date}T${values.time}:00`).toISOString(),
        durationMinutes: Number(values.durationMinutes),
        tableId: values.tableId || null,
        note: values.note.trim() || null,
        internalNote: values.internalNote.trim() || null,
        status: 'CONFIRMED',
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the booking.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>Take a booking</CardTitle>
          <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Guest name" required error={errors.name}>
                <Input value={values.name} onChange={set('name')} required maxLength={120} />
              </Field>
              <Field label="Phone" required error={errors.phone} hint={`e.g. ${phoneCode} 1700-000000`}>
                <Input value={values.phone} onChange={set('phone')} required type="tel" maxLength={24} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date" required error={errors.reservedAt}>
                <Input type="date" value={values.date} onChange={set('date')} required />
              </Field>
              <Field label="Time" required>
                <Input type="time" value={values.time} onChange={set('time')} required step={900} />
              </Field>
              <Field label="Guests" required error={errors.guestCount}>
                <Input type="number" min="1" max="60" value={values.guestCount} onChange={set('guestCount')} required />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Table" hint="Optional — you can assign it later.">
                <Select value={values.tableId} onChange={set('tableId')}>
                  <option value="">No table yet</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id} disabled={table.capacity < Number(values.guestCount)}>
                      {table.name} ({table.capacity} seats)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hold for (minutes)">
                <Input type="number" min="15" max="480" step="15" value={values.durationMinutes} onChange={set('durationMinutes')} />
              </Field>
            </div>

            <Field label="Guest note">
              <Textarea rows={2} value={values.note} onChange={set('note')} maxLength={1000} />
            </Field>

            <Field label="Internal note" hint="Only staff see this.">
              <Textarea rows={2} value={values.internalNote} onChange={set('internalNote')} maxLength={1000} />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : null}
                Save booking
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
