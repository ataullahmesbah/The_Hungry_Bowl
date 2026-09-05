'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney, type CurrencyConfig } from '@/lib/format';

interface AddOn {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  isDefault: boolean;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  selectionType: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  addOns: AddOn[];
  _count: { menuItems: number };
}

interface Draft {
  name: string;
  description: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: string;
  maxSelect: string;
  sortOrder: string;
  addOns: { id?: string; name: string; price: string; isAvailable: boolean; isDefault: boolean }[];
}

const EMPTY: Draft = {
  name: '',
  description: '',
  selectionType: 'MULTIPLE',
  isRequired: false,
  minSelect: '0',
  maxSelect: '',
  sortOrder: '0',
  addOns: [{ name: '', price: '0', isAvailable: true, isDefault: false }],
};

export function AddOnGroupsManager({ groups, currency }: { groups: Group[]; currency: CurrencyConfig }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<Group | null>(null);

  function startEdit(group: Group) {
    setEditing(group.id);
    setErrors({});
    setMessage(null);
    setDraft({
      name: group.name,
      description: group.description ?? '',
      selectionType: group.selectionType === 'SINGLE' ? 'SINGLE' : 'MULTIPLE',
      isRequired: group.isRequired,
      minSelect: String(group.minSelect),
      maxSelect: group.maxSelect != null ? String(group.maxSelect) : '',
      sortOrder: String(group.sortOrder),
      addOns: group.addOns.map((a) => ({
        id: a.id,
        name: a.name,
        price: String(a.price),
        isAvailable: a.isAvailable,
        isDefault: a.isDefault,
      })),
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      selectionType: draft.selectionType,
      isRequired: draft.isRequired,
      minSelect: Number(draft.minSelect) || 0,
      maxSelect: draft.maxSelect ? Number(draft.maxSelect) : null,
      sortOrder: Number(draft.sortOrder) || 0,
      addOns: draft.addOns
        .filter((a) => a.name.trim())
        .map((a, index) => ({
          ...(a.id ? { id: a.id } : {}),
          name: a.name.trim(),
          price: Number(a.price) || 0,
          isAvailable: a.isAvailable,
          isDefault: a.isDefault,
          sortOrder: index,
        })),
    };
    try {
      if (editing === 'new') await api.post('/api/menu/addon-groups', payload);
      else await api.patch(`/api/menu/addon-groups/${editing}`, payload);
      toast.success('Add-on group saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the group.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/menu/addon-groups/${toDelete.id}`);
      toast.success('Group archived');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive');
    } finally {
      setPending(false);
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
          New group
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New add-on group' : 'Edit add-on group'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Group name" required error={errors.name}>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Choose Salad" />
              </Field>
              <Field label="How many can be chosen" error={errors.selectionType}>
                <Select
                  value={draft.selectionType}
                  onChange={(e) => setDraft((d) => ({ ...d, selectionType: e.target.value as 'SINGLE' | 'MULTIPLE' }))}
                >
                  <option value="SINGLE">One only (radio buttons)</option>
                  <option value="MULTIPLE">Any number (checkboxes)</option>
                </Select>
              </Field>
            </div>

            <Field label="Description" error={errors.description}>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Minimum" error={errors.minSelect}>
                <Input type="number" min="0" value={draft.minSelect} onChange={(e) => setDraft((d) => ({ ...d, minSelect: e.target.value }))} />
              </Field>
              <Field label="Maximum" error={errors.maxSelect} hint="Leave blank for no limit">
                <Input type="number" min="1" value={draft.maxSelect} onChange={(e) => setDraft((d) => ({ ...d, maxSelect: e.target.value }))} />
              </Field>
              <Field label="Sort order">
                <Input type="number" min="0" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-espresso-700">
                  <Checkbox checked={draft.isRequired} onChange={(e) => setDraft((d) => ({ ...d, isRequired: e.target.checked }))} />
                  Required
                </label>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-espresso-800">Options</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft((d) => ({ ...d, addOns: [...d.addOns, { name: '', price: '0', isAvailable: true, isDefault: false }] }))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add option
                </Button>
              </div>
              {errors.addOns ? <p className="mb-2 text-xs text-chilli-600">{errors.addOns}</p> : null}
              <ul className="space-y-2">
                {draft.addOns.map((addOn, index) => (
                  <li key={index} className="grid gap-2 rounded-lg border border-espresso-100 bg-cream-50 p-3 sm:grid-cols-[1fr_120px_auto_auto] sm:items-center">
                    <Input
                      aria-label={`Option ${index + 1} name`}
                      value={addOn.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, addOns: d.addOns.map((a, i) => (i === index ? { ...a, name: e.target.value } : a)) }))
                      }
                      placeholder="Extra Cheese"
                    />
                    <Input
                      aria-label={`Option ${index + 1} price`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={addOn.price}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, addOns: d.addOns.map((a, i) => (i === index ? { ...a, price: e.target.value } : a)) }))
                      }
                    />
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-espresso-600">
                      <Checkbox
                        checked={addOn.isDefault}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, addOns: d.addOns.map((a, i) => (i === index ? { ...a, isDefault: e.target.checked } : a)) }))
                        }
                      />
                      Pre-selected
                    </label>
                    {draft.addOns.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, addOns: d.addOns.filter((_, i) => i !== index) }))}
                        className="justify-self-end rounded p-1.5 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                        aria-label={`Remove option ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-espresso-400">Set the price to 0 for a free option.</p>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save group
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {groups.length === 0 ? (
          <Card className="md:col-span-2">
            <p className="px-5 py-12 text-center text-sm text-espresso-400">No add-on groups yet.</p>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <div>
                  <CardTitle>{group.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-espresso-400">
                    {group.selectionType === 'SINGLE' ? 'Choose one' : 'Choose any'}
                    {group.isRequired ? ' · required' : ''} · used on {group._count.menuItems} item
                    {group._count.menuItems === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(group)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setToDelete(group)}
                    className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                    aria-label={`Archive ${group.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {group.addOns.map((addOn) => (
                    <li key={addOn.id}>
                      <Badge tone={addOn.isAvailable ? 'neutral' : 'danger'}>
                        {addOn.name}
                        <span className="ml-1 font-semibold">
                          {addOn.price > 0 ? `+${formatMoney(addOn.price, currency)}` : 'free'}
                        </span>
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Archive “${toDelete?.name}”?`}
        confirmLabel="Archive"
        pending={pending}
        description={
          toDelete && toDelete._count.menuItems > 0
            ? `This group is attached to ${toDelete._count.menuItems} menu item(s). Detach it from them first.`
            : 'Past orders keep the options they used, so history is unaffected.'
        }
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
