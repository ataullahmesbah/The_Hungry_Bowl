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
import { formatMoney, type CurrencyConfig } from '@/lib/format';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  outstandingBalance: number;
  _count: { purchases: number };
}

const EMPTY = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  notes: '',
  isActive: true,
};

export function SuppliersManager({
  suppliers,
  currency,
  canManage,
}: {
  suppliers: Supplier[];
  currency: CurrencyConfig;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone?.includes(q) || s.contactName?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      name: draft.name.trim(),
      contactName: draft.contactName.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      address: draft.address.trim() || null,
      taxNumber: draft.taxNumber.trim() || null,
      notes: draft.notes.trim() || null,
      isActive: draft.isActive,
    };
    try {
      if (editing === 'new') await api.post('/api/suppliers', payload);
      else await api.patch(`/api/suppliers/${editing}`, payload);
      toast.success('Supplier saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the supplier.');
    } finally {
      setPending(false);
    }
  }

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      render: (s) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-espresso-900">
            {s.name}
            {!s.isActive ? <Badge tone="neutral">inactive</Badge> : null}
          </p>
          <p className="text-xs text-espresso-400">
            {[s.contactName, s.phone].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
      ),
    },
    {
      key: 'purchases',
      header: 'Purchases',
      align: 'right',
      render: (s) => <span className="tabular-nums text-espresso-700">{s._count.purchases}</span>,
    },
    {
      key: 'balance',
      header: 'You owe',
      align: 'right',
      render: (s) => (
        <span
          className={
            s.outstandingBalance > 0
              ? 'font-semibold tabular-nums text-chilli-600'
              : 'tabular-nums text-espresso-400'
          }
        >
          {formatMoney(s.outstandingBalance, currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) =>
        canManage ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(s.id);
              setErrors({});
              setMessage(null);
              setDraft({
                name: s.name,
                contactName: s.contactName ?? '',
                phone: s.phone ?? '',
                email: s.email ?? '',
                address: s.address ?? '',
                taxNumber: s.taxNumber ?? '',
                notes: s.notes ?? '',
                isActive: s.isActive,
              });
            }}
          >
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
          New supplier
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New supplier' : 'Edit supplier'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Contact person" error={errors.contactName}>
                <Input value={draft.contactName} onChange={(e) => setDraft((d) => ({ ...d, contactName: e.target.value }))} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Phone" error={errors.phone}>
                <Input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} type="tel" />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} type="email" />
              </Field>
              <Field label="Tax number" error={errors.taxNumber}>
                <Input value={draft.taxNumber} onChange={(e) => setDraft((d) => ({ ...d, taxNumber: e.target.value }))} />
              </Field>
            </div>

            <Field label="Address" error={errors.address}>
              <Input value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} />
            </Field>

            <Field label="Notes">
              <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-espresso-700">
              <Checkbox checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} />
              Active
            </label>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save supplier
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
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers" className="pl-8" />
          </div>
        </div>
        <DataTable columns={columns} rows={filtered} emptyMessage="No suppliers yet." />
      </Card>
    </div>
  );
}
