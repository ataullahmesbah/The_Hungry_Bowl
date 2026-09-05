'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeftRight, ClipboardList, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { StatCard } from '@/components/dashboard/stat-card';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney, formatQuantity, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Item {
  id: string;
  name: string;
  sku: string | null;
  reorderLevel: number;
  criticalLevel: number;
  avgUnitCost: number;
  isActive: boolean;
  unit: { id: string; code: string; name: string };
  category: { id: string; name: string } | null;
  balances: { quantity: number; warehouse: { id: string; name: string; kind: string } }[];
}

type MovementKind = 'TRANSFER' | 'WASTAGE' | 'ADJUSTMENT' | 'CONSUMPTION' | 'OPENING';

export function InventoryBoard({
  items,
  warehouses,
  units,
  categories,
  currency,
  initialFilter,
  can,
}: {
  items: Item[];
  warehouses: { id: string; name: string; kind: string }[];
  units: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  currency: CurrencyConfig;
  initialFilter: string;
  can: { manage: boolean; transfer: boolean; adjust: boolean; wastage: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [movementFor, setMovementFor] = useState<{ item: Item; kind: MovementKind } | null>(null);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);

  const enriched = useMemo(
    () =>
      items.map((item) => {
        const total = item.balances.reduce((sum, b) => sum + b.quantity, 0);
        return {
          ...item,
          total: Number(total.toFixed(3)),
          isLow: item.reorderLevel > 0 && total <= item.reorderLevel,
          isCritical: item.criticalLevel > 0 && total <= item.criticalLevel,
          value: total * item.avgUnitCost,
        };
      }),
    [items],
  );

  const stats = useMemo(
    () => ({
      count: enriched.length,
      low: enriched.filter((i) => i.isLow).length,
      critical: enriched.filter((i) => i.isCritical).length,
      value: enriched.reduce((sum, i) => sum + i.value, 0),
    }),
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((item) => {
      if (filter === 'low' && !item.isLow) return false;
      if (filter === 'critical' && !item.isCritical) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.sku?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, search, filter]);

  const columns: Column<(typeof enriched)[number]>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <div>
          <p className="flex items-center gap-2 font-medium text-espresso-900">
            {item.name}
            {item.isCritical ? (
              <Badge tone="danger">critical</Badge>
            ) : item.isLow ? (
              <Badge tone="warning">low</Badge>
            ) : null}
          </p>
          <p className="text-xs text-espresso-400">
            {[item.sku, item.category?.name].filter(Boolean).join(' · ') || 'Uncategorised'}
          </p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'In stock',
      align: 'right',
      // Where the stock physically sits is the first thing an auditor or a
      // store manager checks, so each location gets its own line with the unit
      // spelled out — a run-on "Main Warehouse: 7 · Kitchen Store: 8" is not
      // something anyone can read down a column.
      render: (item) => {
        const held = item.balances.filter((b) => b.quantity !== 0);
        return (
          <div className="inline-flex min-w-[11rem] flex-col items-stretch gap-1 text-right">
            <p
              className={cn(
                'font-semibold tabular-nums',
                item.isCritical ? 'text-chilli-600' : item.isLow ? 'text-saffron-700' : 'text-espresso-900',
              )}
            >
              {formatQuantity(item.total, item.unit.code)}
            </p>
            {held.length > 0 ? (
              <ul className="space-y-0.5 border-t border-espresso-100 pt-1">
                {held.map((b) => (
                  <li key={b.warehouse.id} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-espresso-500">{b.warehouse.name}</span>
                    <span className="shrink-0 tabular-nums text-espresso-700">
                      {formatQuantity(b.quantity, item.unit.code)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-espresso-100 pt-1 text-xs text-espresso-400">not in any store</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      render: (item) => (
        <span className="text-xs tabular-nums text-espresso-500">
          {item.reorderLevel > 0 ? formatQuantity(item.reorderLevel, item.unit.code) : '—'}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Avg cost',
      align: 'right',
      render: (item) => (
        <div>
          <p className="tabular-nums text-espresso-700">{formatMoney(item.avgUnitCost, currency)}</p>
          <p className="text-xs text-espresso-400">value {formatMoney(item.value, currency)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (item) => (
        <div className="flex justify-end gap-1">
          {can.transfer ? (
            <Button size="sm" variant="ghost" title="Transfer" onClick={() => setMovementFor({ item, kind: 'TRANSFER' })}>
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {can.adjust ? (
            <Button size="sm" variant="ghost" title="Stock count" onClick={() => setMovementFor({ item, kind: 'ADJUSTMENT' })}>
              <ClipboardList className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {can.wastage ? (
            <Button size="sm" variant="ghost" title="Wastage" onClick={() => setMovementFor({ item, kind: 'WASTAGE' })}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {can.manage ? (
            <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(item)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Items tracked" value={stats.count} icon="Package" />
        <StatCard label="Low stock" value={stats.low} icon="PackageMinus" tone={stats.low > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Critical" value={stats.critical} icon="AlertTriangle" tone={stats.critical > 0 ? 'danger' : 'neutral'} />
        <StatCard label="Stock value" value={formatMoney(stats.value, currency)} icon="Wallet" tone="accent" />
      </div>

      {can.manage && !editing ? (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          New item
        </Button>
      ) : null}

      {editing ? (
        <ItemForm
          item={editing === 'new' ? null : editing}
          units={units}
          categories={categories}
          warehouses={warehouses}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success('Inventory item saved');
            router.refresh();
          }}
        />
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU" className="pl-8" />
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto" aria-label="Filter">
            <option value="">All items</option>
            <option value="low">Low stock</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
        <DataTable columns={columns} rows={filtered} emptyMessage="No inventory items match this view." />
      </Card>

      {movementFor ? (
        <MovementDialog
          item={movementFor.item}
          kind={movementFor.kind}
          warehouses={warehouses}
          onClose={() => setMovementFor(null)}
          onDone={(label) => {
            setMovementFor(null);
            toast.success(label);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    </div>
  );
}

const KIND_TITLE: Record<MovementKind, string> = {
  TRANSFER: 'Transfer stock',
  WASTAGE: 'Record wastage',
  ADJUSTMENT: 'Stock count',
  CONSUMPTION: 'Record consumption',
  OPENING: 'Opening stock',
};

function MovementDialog({
  item,
  kind,
  warehouses,
  onClose,
  onDone,
}: {
  item: Item;
  kind: MovementKind;
  warehouses: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const withStock = item.balances.filter((b) => b.quantity > 0);
  const [fromWarehouseId, setFromWarehouseId] = useState(withStock[0]?.warehouse.id ?? warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(
    warehouses.find((w) => w.kind === 'KITCHEN' && w.id !== withStock[0]?.warehouse.id)?.id ?? '',
  );

  // Anywhere but where the stock is coming from. Kept derived rather than
  // stored, so changing "From" can never leave a stale destination behind —
  // picking the source as the destination would fail server-side validation
  // while the dropdown still looked correct.
  const destinations = warehouses.filter((w) => w.id !== fromWarehouseId);
  const toId = destinations.some((w) => w.id === toWarehouseId)
    ? toWarehouseId
    : (destinations[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const available = item.balances.find((b) => b.warehouse.id === fromWarehouseId)?.quantity ?? 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const payload: Record<string, unknown> = { kind, itemId: item.id };
    if (kind === 'TRANSFER') {
      Object.assign(payload, {
        fromWarehouseId,
        toWarehouseId: toId,
        quantity: Number(quantity),
        note: note.trim() || null,
      });
    } else if (kind === 'WASTAGE' || kind === 'CONSUMPTION') {
      Object.assign(payload, {
        warehouseId: fromWarehouseId,
        quantity: Number(quantity),
        reason: reason.trim(),
        note: note.trim() || null,
      });
    } else if (kind === 'ADJUSTMENT') {
      Object.assign(payload, {
        warehouseId: fromWarehouseId,
        countedQuantity: Number(counted),
        reason: reason.trim(),
        note: note.trim() || null,
      });
    } else {
      Object.assign(payload, {
        warehouseId: fromWarehouseId,
        quantity: Number(quantity),
        note: note.trim() || null,
      });
    }

    try {
      await api.post('/api/inventory/movements', payload);
      onDone(`${KIND_TITLE[kind]} recorded for ${item.name}`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not record the movement.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={`${KIND_TITLE[kind]} — ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <Field label={kind === 'TRANSFER' ? 'From' : 'Location'} required>
          <Select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} required>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {' · '}
                {(item.balances.find((b) => b.warehouse.id === w.id)?.quantity ?? 0)} {item.unit.code}
              </option>
            ))}
          </Select>
        </Field>

        {kind === 'TRANSFER' ? (
          <Field label="To" required>
            <Select value={toId} onChange={(e) => setToWarehouseId(e.target.value)} required>
              {destinations
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        {kind === 'ADJUSTMENT' ? (
          <>
            <Alert tone="info">
              Enter what you actually counted. The system works out the difference and records it, so you never have to
              do the arithmetic.
            </Alert>
            <Field label={`Counted quantity (${item.unit.code})`} required hint={`System currently shows ${available} ${item.unit.code}`}>
              <Input type="number" min="0" step="0.001" value={counted} onChange={(e) => setCounted(e.target.value)} required autoFocus />
            </Field>
          </>
        ) : (
          <Field
            label={`Quantity (${item.unit.code})`}
            required
            hint={kind !== 'OPENING' ? `${available} ${item.unit.code} available here` : undefined}
          >
            <Input type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />
          </Field>
        )}

        {kind === 'WASTAGE' || kind === 'ADJUSTMENT' || kind === 'CONSUMPTION' ? (
          <Field
            label="Reason"
            required={kind === 'WASTAGE' || kind === 'ADJUSTMENT'}
            hint={kind === 'WASTAGE' ? 'Spoiled, dropped, burnt, expired…' : undefined}
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required={kind !== 'CONSUMPTION'} />
          </Field>
        ) : null}

        <Field label="Note" hint="Optional">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending} variant={kind === 'WASTAGE' ? 'danger' : 'primary'}>
            {pending ? <Spinner /> : <Package className="h-4 w-4" />}
            Record
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>

        {kind === 'WASTAGE' || kind === 'ADJUSTMENT' ? (
          <p className="flex items-start gap-1.5 text-xs text-espresso-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This is recorded in the audit log against your name.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function ItemForm({
  item,
  units,
  categories,
  warehouses,
  onClose,
  onDone,
}: {
  item: Item | null;
  units: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  warehouses: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState({
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    unitId: item?.unit.id ?? units[0]?.id ?? '',
    categoryId: item?.category?.id ?? '',
    reorderLevel: String(item?.reorderLevel ?? 0),
    criticalLevel: String(item?.criticalLevel ?? 0),
    isActive: item?.isActive ?? true,
    openingQty: '',
    openingCost: '',
    openingWarehouseId: warehouses[0]?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim() || null,
      unitId: values.unitId,
      categoryId: values.categoryId || null,
      reorderLevel: Number(values.reorderLevel) || 0,
      criticalLevel: Number(values.criticalLevel) || 0,
      isActive: values.isActive,
    };

    try {
      if (item) {
        await api.patch(`/api/inventory/items/${item.id}`, payload);
      } else {
        const created = await api.post<{ id: string }>('/api/inventory/items', payload);
        if (Number(values.openingQty) > 0) {
          await api.post('/api/inventory/movements', {
            kind: 'OPENING',
            itemId: created.id,
            warehouseId: values.openingWarehouseId,
            quantity: Number(values.openingQty),
            ...(values.openingCost ? { unitCost: Number(values.openingCost) } : {}),
          });
        }
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the item.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={item ? `Edit ${item.name}` : 'New inventory item'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required placeholder="Chicken" />
          </Field>
          <Field label="SKU / code" error={errors.sku} hint="Optional">
            <Input value={values.sku} onChange={(e) => setValues((v) => ({ ...v, sku: e.target.value }))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit" required error={errors.unitId}>
            <Select value={values.unitId} onChange={(e) => setValues((v) => ({ ...v, unitId: e.target.value }))} required>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" error={errors.categoryId}>
            <Select value={values.categoryId} onChange={(e) => setValues((v) => ({ ...v, categoryId: e.target.value }))}>
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reorder level" hint="Warn when stock drops to this.">
            <Input type="number" min="0" step="0.001" value={values.reorderLevel} onChange={(e) => setValues((v) => ({ ...v, reorderLevel: e.target.value }))} />
          </Field>
          <Field label="Critical level" hint="Raise a critical alert at this level.">
            <Input type="number" min="0" step="0.001" value={values.criticalLevel} onChange={(e) => setValues((v) => ({ ...v, criticalLevel: e.target.value }))} />
          </Field>
        </div>

        {!item ? (
          <fieldset className="rounded-lg border border-espresso-100 bg-cream-50 p-3">
            <legend className="px-1 text-xs font-medium text-espresso-600">Opening stock (optional)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quantity">
                <Input type="number" min="0" step="0.001" value={values.openingQty} onChange={(e) => setValues((v) => ({ ...v, openingQty: e.target.value }))} />
              </Field>
              <Field label="Cost per unit">
                <Input type="number" min="0" step="0.01" value={values.openingCost} onChange={(e) => setValues((v) => ({ ...v, openingCost: e.target.value }))} />
              </Field>
              <Field label="Location">
                <Select value={values.openingWarehouseId} onChange={(e) => setValues((v) => ({ ...v, openingWarehouseId: e.target.value }))}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-espresso-700">
          <Checkbox checked={values.isActive} onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))} />
          Active
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Save item
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
