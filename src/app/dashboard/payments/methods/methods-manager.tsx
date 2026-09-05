'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';

interface Method {
  id: string;
  key: string;
  name: string;
  kind: string;
  isActive: boolean;
  requiresReference: boolean;
  countryCode: string | null;
  instructions: string | null;
  sortOrder: number;
  paymentCount: number;
}

interface Draft {
  key: string;
  name: string;
  kind: string;
  isActive: boolean;
  requiresReference: boolean;
  countryCode: string;
  instructions: string;
  sortOrder: string;
}

const EMPTY: Draft = {
  key: '',
  name: '',
  kind: 'OTHER',
  isActive: true,
  requiresReference: false,
  countryCode: '',
  instructions: '',
  sortOrder: '50',
};

export function MethodsManager({
  methods,
  restaurantCountry,
}: {
  methods: Method[];
  restaurantCountry: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function startEdit(method: Method) {
    setEditing(method.id);
    setErrors({});
    setMessage(null);
    setDraft({
      key: method.key,
      name: method.name,
      kind: method.kind,
      isActive: method.isActive,
      requiresReference: method.requiresReference,
      countryCode: method.countryCode ?? '',
      instructions: method.instructions ?? '',
      sortOrder: String(method.sortOrder),
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      key: draft.key.trim().toUpperCase(),
      name: draft.name.trim(),
      kind: draft.kind,
      isActive: draft.isActive,
      requiresReference: draft.requiresReference,
      countryCode: draft.countryCode.trim().toUpperCase() || null,
      instructions: draft.instructions.trim() || null,
      sortOrder: Number(draft.sortOrder) || 0,
    };
    try {
      if (editing === 'new') await api.post('/api/payment-methods', payload);
      else await api.patch(`/api/payment-methods/${editing}`, payload);
      toast.success('Payment method saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the payment method.');
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(method: Method) {
    try {
      await api.patch(`/api/payment-methods/${method.id}`, { isActive: !method.isActive });
      toast.success(`${method.name} ${method.isActive ? 'switched off' : 'switched on'}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update');
    }
  }

  return (
    <div className="space-y-5">
      {!editing ? (
        <Button
          onClick={() => {
            setEditing('new');
            setDraft(EMPTY);
            setErrors({});
            setMessage(null);
          }}
        >
          <Plus className="h-4 w-4" />
          Add a method
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New payment method' : 'Edit payment method'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" required error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="bKash" />
              </Field>
              <Field
                label="Code"
                required
                error={errors.key}
                hint="Capitals and underscores. Cannot be changed once payments exist."
              >
                <Input
                  value={draft.key}
                  onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                  placeholder="BKASH"
                  disabled={editing !== 'new'}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type" error={errors.kind}>
                <Select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="MOBILE">Mobile wallet</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field
                label="Country"
                error={errors.countryCode}
                hint="Two-letter code, or blank for everywhere."
              >
                <Input
                  value={draft.countryCode}
                  onChange={(e) => setDraft((d) => ({ ...d, countryCode: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder={restaurantCountry}
                  maxLength={2}
                />
              </Field>
              <Field label="Sort order">
                <Input type="number" min="0" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
              </Field>
            </div>

            <Field label="Instructions for staff" hint="Shown on the payment screen when this method is chosen.">
              <Textarea rows={2} value={draft.instructions} onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))} />
            </Field>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} />
                Available to staff
              </label>
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox
                  checked={draft.requiresReference}
                  onChange={(e) => setDraft((d) => ({ ...d, requiresReference: e.target.checked }))}
                />
                Require a transaction reference
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save method
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-espresso-100">
          {methods.map((method) => {
            const hiddenHere = method.countryCode && method.countryCode !== restaurantCountry;
            return (
              <li key={method.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-espresso-900">
                    {method.name}
                    <Badge tone={method.isActive ? 'success' : 'neutral'}>{method.isActive ? 'on' : 'off'}</Badge>
                    {method.countryCode ? <Badge tone="info">{method.countryCode}</Badge> : null}
                    {hiddenHere ? <Badge tone="warning">hidden here</Badge> : null}
                    {method.requiresReference ? <Badge tone="neutral">needs reference</Badge> : null}
                  </p>
                  <p className="text-xs text-espresso-400">
                    {method.key} · {method.kind.toLowerCase()} · {method.paymentCount} payment
                    {method.paymentCount === 1 ? '' : 's'} recorded
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void toggleActive(method)}>
                  {method.isActive ? 'Switch off' : 'Switch on'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(method)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
