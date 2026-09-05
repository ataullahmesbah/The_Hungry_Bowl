'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDate, formatMoney, type CurrencyConfig } from '@/lib/format';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  totalVisits: number;
  totalSpend: number;
  lastVisitAt: string | null;
  isBlacklisted: boolean;
}

interface Draft {
  name: string;
  phone: string;
  email: string;
  notes: string;
  isBlacklisted: boolean;
}

const EMPTY: Draft = { name: '', phone: '', email: '', notes: '', isBlacklisted: false };

export function CustomersManager({
  customers,
  currency,
  timezone,
  locale,
  canManage,
}: {
  customers: Customer[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  function startEdit(customer: Customer) {
    setEditing(customer.id);
    setErrors({});
    setMessage(null);
    setDraft({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      notes: customer.notes ?? '',
      isBlacklisted: customer.isBlacklisted,
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      notes: draft.notes.trim() || null,
      isBlacklisted: draft.isBlacklisted,
    };
    try {
      if (editing === 'new') await api.post('/api/customers', payload);
      else await api.patch(`/api/customers/${editing}`, payload);
      toast.success('Customer saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the customer.');
    } finally {
      setPending(false);
    }
  }

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (customer) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-espresso-900">
            {customer.name}
            {customer.isBlacklisted ? <Badge tone="danger">blocked</Badge> : null}
          </p>
          <p className="text-xs text-espresso-400">
            {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
      ),
    },
    {
      key: 'visits',
      header: 'Visits',
      align: 'right',
      render: (customer) => <span className="tabular-nums text-espresso-700">{customer.totalVisits}</span>,
    },
    {
      key: 'spend',
      header: 'Total spend',
      align: 'right',
      render: (customer) => (
        <span className="font-medium tabular-nums text-espresso-900">{formatMoney(customer.totalSpend, currency)}</span>
      ),
    },
    {
      key: 'last',
      header: 'Last visit',
      align: 'right',
      render: (customer) => (
        <span className="text-xs text-espresso-400">
          {customer.lastVisitAt ? formatDate(customer.lastVisitAt, timezone, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (customer) =>
        canManage ? (
          <Button size="sm" variant="ghost" onClick={() => startEdit(customer)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      {canManage && !editing ? (
        <Button
          onClick={() => {
            setEditing('new');
            setDraft(EMPTY);
            setErrors({});
            setMessage(null);
          }}
        >
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New customer' : 'Edit customer'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" required error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} type="tel" />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} type="email" />
              </Field>
            </div>

            <Field label="Notes" hint="Preferences, allergies, anything the team should remember.">
              <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-espresso-700">
              <Checkbox checked={draft.isBlacklisted} onChange={(e) => setDraft((d) => ({ ...d, isBlacklisted: e.target.checked }))} />
              Block this customer from new bookings
            </label>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save customer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <div className="border-b border-espresso-100 px-5 py-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone or email" className="pl-8" />
          </div>
        </div>
        <DataTable columns={columns} rows={filtered} emptyMessage="No customers yet." />
      </Card>
    </div>
  );
}
