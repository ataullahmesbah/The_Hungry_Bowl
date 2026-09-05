'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/client/api-client';

export function ReservationForm({
  maxGuests,
  leadHours,
  phoneCode,
}: {
  maxGuests: number;
  leadHours: number;
  phoneCode: string;
}) {
  const [values, setValues] = useState({
    name: '',
    phone: '',
    email: '',
    guestCount: '2',
    date: '',
    time: '19:00',
    note: '',
    company: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Earliest bookable day, given the lead time the restaurant requires. */
  const minDate = useMemo(() => {
    const earliest = new Date(Date.now() + leadHours * 60 * 60 * 1000);
    return earliest.toISOString().slice(0, 10);
  }, [leadHours]);

  function set(key: keyof typeof values) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    if (!values.date) {
      setErrors({ date: 'Choose a date' });
      setPending(false);
      return;
    }

    const reservedAt = new Date(`${values.date}T${values.time}:00`);
    if (Number.isNaN(reservedAt.getTime())) {
      setErrors({ date: 'That date and time do not look right' });
      setPending(false);
      return;
    }

    try {
      const result = await api.post<{ code: string }>('/api/public/reservations', {
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim() || undefined,
        guestCount: Number(values.guestCount),
        reservedAt: reservedAt.toISOString(),
        note: values.note.trim() || undefined,
        company: values.company,
      });
      setCode(result.code);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else {
        setMessage('Could not send your request. Please check your connection or call us.');
      }
    } finally {
      setPending(false);
    }
  }

  if (code) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-basil-500" />
        <h2 className="mt-4 font-[family-name:--font-display] text-2xl font-semibold text-espresso-900">
          Request received
        </h2>
        <p className="mt-2 text-espresso-600">
          Your reference is{' '}
          <strong className="font-mono font-semibold text-espresso-900">{code}</strong>. We will call you shortly to
          confirm the table.
        </p>
        <p className="mt-4 text-sm text-espresso-400">
          A reservation is not held until we confirm it. If your plans change, please let us know.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message ? <Alert tone="danger">{message}</Alert> : null}

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" value={values.company} onChange={set('company')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" required error={errors.name}>
          <Input id="name" required maxLength={120} autoComplete="name" value={values.name} onChange={set('name')} />
        </Field>

        <Field label="Phone number" htmlFor="phone" required error={errors.phone} hint={`Include the code, e.g. ${phoneCode}`}>
          <Input
            id="phone"
            type="tel"
            required
            maxLength={24}
            autoComplete="tel"
            value={values.phone}
            onChange={set('phone')}
            placeholder={`${phoneCode} 1700-000000`}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" error={errors.email} hint="Optional — only used if we cannot reach you by phone.">
        <Input id="email" type="email" maxLength={200} autoComplete="email" value={values.email} onChange={set('email')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" required error={errors.date ?? errors.reservedAt}>
          <Input id="date" type="date" required min={minDate} value={values.date} onChange={set('date')} />
        </Field>

        <Field label="Time" htmlFor="time" required error={errors.time}>
          <Input id="time" type="time" required step={900} value={values.time} onChange={set('time')} />
        </Field>

        <Field label="Guests" htmlFor="guestCount" required error={errors.guestCount}>
          <Select id="guestCount" required value={values.guestCount} onChange={set('guestCount')}>
            {Array.from({ length: maxGuests }).map((_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1} {index === 0 ? 'guest' : 'guests'}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Anything we should know?"
        htmlFor="note"
        error={errors.note}
        hint="Birthday, high chair, wheelchair access, allergies — tell us here."
      >
        <Textarea id="note" rows={3} maxLength={1000} value={values.note} onChange={set('note')} />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <CalendarCheck className="h-4 w-4" />}
        {pending ? 'Sending…' : 'Request this table'}
      </Button>

      <p className="text-center text-xs text-espresso-400">
        No payment is taken online. We will call you to confirm.
      </p>
    </form>
  );
}
