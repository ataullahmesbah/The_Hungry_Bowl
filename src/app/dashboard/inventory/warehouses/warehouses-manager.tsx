'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Warehouse, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';

interface WarehouseRow {
  id: string;
  name: string;
  kind: string;
  location: string | null;
  isActive: boolean;
  isDefaultReceiving: boolean;
  isDefaultConsumption: boolean;
  lineCount: number;
}

const EMPTY = {
  name: '',
  kind: 'WAREHOUSE',
  location: '',
  isActive: true,
  isDefaultReceiving: false,
  isDefaultConsumption: false,
};

export function WarehousesManager({
  warehouses,
  canManage,
}: {
  warehouses: WarehouseRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setMessage(null);
    const payload = { ...draft, location: draft.location.trim() || null };
    try {
      if (editing === 'new') await api.post('/api/inventory/warehouses', payload);
      else await api.patch(`/api/inventory/warehouses/${editing}`, payload);
      toast.success('Location saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save the location.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {canManage && !editing ? (
        <Button
          onClick={() => {
            setEditing('new');
            setDraft(EMPTY);
            setMessage(null);
          }}
        >
          <Plus className="h-4 w-4" />
          New location
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New location' : 'Edit location'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" required>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Main Warehouse" />
              </Field>
              <Field label="Type">
                <Select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="KITCHEN">Kitchen</option>
                  <option value="BAR">Bar</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Location" hint="Optional">
                <Input value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
              </Field>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={draft.isDefaultReceiving} onChange={(e) => setDraft((d) => ({ ...d, isDefaultReceiving: e.target.checked }))} />
                Deliveries arrive here by default
              </label>
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={draft.isDefaultConsumption} onChange={(e) => setDraft((d) => ({ ...d, isDefaultConsumption: e.target.checked }))} />
                Recipes deduct ingredients from here
              </label>
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} />
                Active
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save location
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {warehouses.map((w) => (
          <Card key={w.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-espresso-900">
                    <Warehouse className="h-4 w-4 text-espresso-400" />
                    {w.name}
                  </p>
                  <p className="mt-0.5 text-xs text-espresso-400">
                    {w.kind.toLowerCase()}
                    {w.location ? ` · ${w.location}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(w.id);
                      setMessage(null);
                      setDraft({
                        name: w.name,
                        kind: w.kind,
                        location: w.location ?? '',
                        isActive: w.isActive,
                        isDefaultReceiving: w.isDefaultReceiving,
                        isDefaultConsumption: w.isDefaultConsumption,
                      });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {!w.isActive ? <Badge tone="neutral">inactive</Badge> : null}
                {w.isDefaultReceiving ? <Badge tone="info">receives deliveries</Badge> : null}
                {w.isDefaultConsumption ? <Badge tone="accent">recipe source</Badge> : null}
              </div>

              <p className="mt-3 text-sm text-espresso-500">
                {w.lineCount} item{w.lineCount === 1 ? '' : 's'} held here
              </p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
