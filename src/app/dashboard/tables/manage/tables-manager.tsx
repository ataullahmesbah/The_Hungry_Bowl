'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Grid3x3, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';

interface AreaRow {
  id: string;
  name: string;
  floor: string | null;
  sortOrder: number;
  isActive: boolean;
  tableCount: number;
}

interface TableRow {
  id: string;
  name: string;
  areaId: string | null;
  areaName: string | null;
  capacity: number;
  shape: string;
  status: string;
  isActive: boolean;
  notes: string | null;
  hasOpenSession: boolean;
  sessionCount: number;
  orderCount: number;
}

const EMPTY_TABLE = {
  name: '',
  areaId: '',
  capacity: 4,
  shape: 'square',
  isActive: true,
  notes: '',
};

const EMPTY_AREA = { name: '', floor: '', sortOrder: 0, isActive: true };

export function TablesManager({
  areas,
  tables,
  canManage,
}: {
  areas: AreaRow[];
  tables: TableRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [tableEditing, setTableEditing] = useState<string | 'new' | null>(null);
  const [tableDraft, setTableDraft] = useState(EMPTY_TABLE);
  const [areaEditing, setAreaEditing] = useState<string | 'new' | null>(null);
  const [areaDraft, setAreaDraft] = useState(EMPTY_AREA);
  const [removing, setRemoving] = useState<TableRow | null>(null);
  const [removingArea, setRemovingArea] = useState<AreaRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>, done: string, after: () => void) {
    setPending(true);
    setMessage(null);
    try {
      await action();
      toast.success(done);
      after();
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function saveTable() {
    const payload = {
      name: tableDraft.name.trim(),
      areaId: tableDraft.areaId || null,
      capacity: Number(tableDraft.capacity),
      shape: tableDraft.shape,
      isActive: tableDraft.isActive,
      notes: tableDraft.notes.trim() || null,
    };
    void run(
      () => (tableEditing === 'new' ? api.post('/api/tables', payload) : api.patch(`/api/tables/${tableEditing}`, payload)),
      'Table saved',
      () => setTableEditing(null),
    );
  }

  function saveArea() {
    const payload = {
      name: areaDraft.name.trim(),
      floor: areaDraft.floor.trim() || null,
      sortOrder: Number(areaDraft.sortOrder),
      isActive: areaDraft.isActive,
    };
    void run(
      () => (areaEditing === 'new' ? api.post('/api/table-areas', payload) : api.patch(`/api/table-areas/${areaEditing}`, payload)),
      'Area saved',
      () => setAreaEditing(null),
    );
  }

  const grouped = [
    ...areas.map((area) => ({ area, rows: tables.filter((t) => t.areaId === area.id) })),
    { area: null, rows: tables.filter((t) => !t.areaId) },
  ].filter((g) => g.rows.length > 0 || g.area);

  return (
    <div className="space-y-8">
      {message ? <Alert tone="danger">{message}</Alert> : null}

      {/* ---------------------------------------------------------------- areas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-espresso-900">
            <Layers className="h-4 w-4 text-espresso-400" />
            Areas &amp; floors
          </h2>
          {canManage && !areaEditing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAreaEditing('new');
                setAreaDraft({ ...EMPTY_AREA, sortOrder: areas.length });
                setMessage(null);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New area
            </Button>
          ) : null}
        </div>

        {areaEditing ? (
          <Card>
            <CardHeader>
              <CardTitle>{areaEditing === 'new' ? 'New area' : 'Edit area'}</CardTitle>
              <button type="button" onClick={() => setAreaEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name" required>
                  <Input
                    value={areaDraft.name}
                    onChange={(e) => setAreaDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Ground Floor"
                  />
                </Field>
                <Field label="Floor" hint="Optional label">
                  <Input
                    value={areaDraft.floor}
                    onChange={(e) => setAreaDraft((d) => ({ ...d, floor: e.target.value }))}
                    placeholder="Ground"
                  />
                </Field>
                <Field label="Order" hint="Lower shows first">
                  <Input
                    type="number"
                    min={0}
                    value={areaDraft.sortOrder}
                    onChange={(e) => setAreaDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={areaDraft.isActive} onChange={(e) => setAreaDraft((d) => ({ ...d, isActive: e.target.checked }))} />
                Active
              </label>
              <div className="flex gap-2">
                <Button type="button" onClick={saveArea} disabled={pending || !areaDraft.name.trim()}>
                  {pending ? <Spinner /> : null}
                  Save area
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAreaEditing(null)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {areas.length === 0 ? (
          <p className="text-sm text-espresso-500">No areas yet. Tables can still exist without one.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <span
                key={area.id}
                className="inline-flex items-center gap-2 rounded-lg border border-espresso-100 bg-white px-3 py-1.5 text-sm"
              >
                <span className="font-medium text-espresso-900">{area.name}</span>
                <span className="text-xs text-espresso-400">
                  {area.tableCount} table{area.tableCount === 1 ? '' : 's'}
                </span>
                {!area.isActive ? <Badge tone="neutral">inactive</Badge> : null}
                {canManage ? (
                  <>
                    <button
                      type="button"
                      className="rounded p-0.5 text-espresso-400 hover:text-espresso-700"
                      aria-label={`Edit ${area.name}`}
                      onClick={() => {
                        setAreaEditing(area.id);
                        setAreaDraft({
                          name: area.name,
                          floor: area.floor ?? '',
                          sortOrder: area.sortOrder,
                          isActive: area.isActive,
                        });
                        setMessage(null);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-espresso-400 hover:text-chilli-600"
                      aria-label={`Delete ${area.name}`}
                      onClick={() => setRemovingArea(area)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------- tables */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-espresso-900">
            <Grid3x3 className="h-4 w-4 text-espresso-400" />
            Tables
            <span className="text-xs font-normal text-espresso-400">{tables.length} total</span>
          </h2>
          {canManage && !tableEditing ? (
            <Button
              onClick={() => {
                setTableEditing('new');
                setTableDraft({ ...EMPTY_TABLE, areaId: areas[0]?.id ?? '' });
                setMessage(null);
              }}
            >
              <Plus className="h-4 w-4" />
              New table
            </Button>
          ) : null}
        </div>

        {tableEditing ? (
          <Card>
            <CardHeader>
              <CardTitle>{tableEditing === 'new' ? 'New table' : 'Edit table'}</CardTitle>
              <button type="button" onClick={() => setTableEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Table name" required hint="Must be unique, e.g. T05">
                  <Input
                    value={tableDraft.name}
                    onChange={(e) => setTableDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="T05"
                  />
                </Field>
                <Field label="Area">
                  <Select value={tableDraft.areaId} onChange={(e) => setTableDraft((d) => ({ ...d, areaId: e.target.value }))}>
                    <option value="">No area</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Seats" required>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={tableDraft.capacity}
                    onChange={(e) => setTableDraft((d) => ({ ...d, capacity: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Shape">
                  <Select value={tableDraft.shape} onChange={(e) => setTableDraft((d) => ({ ...d, shape: e.target.value }))}>
                    <option value="square">Square</option>
                    <option value="round">Round</option>
                    <option value="rect">Rectangle</option>
                  </Select>
                </Field>
              </div>

              <Field label="Note" hint="Optional — window side, near AC, reserved for staff…">
                <Input value={tableDraft.notes} onChange={(e) => setTableDraft((d) => ({ ...d, notes: e.target.value }))} />
              </Field>

              <label className="flex items-center gap-2 text-sm text-espresso-700">
                <Checkbox checked={tableDraft.isActive} onChange={(e) => setTableDraft((d) => ({ ...d, isActive: e.target.checked }))} />
                Available for seating
              </label>

              <div className="flex gap-2">
                <Button type="button" onClick={saveTable} disabled={pending || !tableDraft.name.trim()}>
                  {pending ? <Spinner /> : null}
                  Save table
                </Button>
                <Button type="button" variant="ghost" onClick={() => setTableEditing(null)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {tables.length === 0 ? (
          <EmptyState title="No tables yet" description="Add your first table to start seating guests." />
        ) : (
          grouped.map(({ area, rows }) => (
            <div key={area?.id ?? 'none'} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-espresso-400">
                {area ? `${area.name}${area.floor ? ` · ${area.floor}` : ''}` : 'No area'}
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-espresso-400">No tables here yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rows.map((table) => (
                    <Card key={table.id}>
                      <CardBody className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-espresso-900">{table.name}</p>
                            <p className="text-xs text-espresso-400">
                              {table.capacity} seat{table.capacity === 1 ? '' : 's'} · {table.shape}
                            </p>
                          </div>
                          {canManage ? (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Edit"
                                onClick={() => {
                                  setTableEditing(table.id);
                                  setTableDraft({
                                    name: table.name,
                                    areaId: table.areaId ?? '',
                                    capacity: table.capacity,
                                    shape: table.shape,
                                    isActive: table.isActive,
                                    notes: table.notes ?? '',
                                  });
                                  setMessage(null);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Remove" onClick={() => setRemoving(table)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {table.hasOpenSession ? <Badge tone="warning">guests seated</Badge> : null}
                          {!table.isActive ? <Badge tone="neutral">not in service</Badge> : null}
                          {table.orderCount > 0 ? (
                            <Badge tone="info">
                              {table.orderCount} order{table.orderCount === 1 ? '' : 's'} in history
                            </Badge>
                          ) : null}
                        </div>

                        {table.notes ? <p className="text-xs text-espresso-500">{table.notes}</p> : null}
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Remove table ${removing.name}?` : ''}
        tone="danger"
        confirmLabel="Remove table"
        pending={pending}
        description={
          removing?.hasOpenSession ? (
            <>
              Guests are seated at <strong>{removing.name}</strong> right now. Close their session and settle the bill
              first — removing it would strand a live bill.
            </>
          ) : (
            <>
              {removing && removing.orderCount > 0 ? (
                <>
                  <strong>{removing.name}</strong> has {removing.orderCount} past order
                  {removing.orderCount === 1 ? '' : 's'}. Those bills and reports stay exactly as they are — the table is
                  retired, never erased.{' '}
                </>
              ) : null}
              It disappears from the floor plan and can no longer be seated.
            </>
          )
        }
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          if (removing.hasOpenSession) {
            setMessage('Close the open session on this table first.');
            setRemoving(null);
            return;
          }
          void run(() => api.del(`/api/tables/${removing.id}`), `Table ${removing.name} removed`, () => setRemoving(null));
        }}
      />

      <ConfirmDialog
        open={Boolean(removingArea)}
        title={removingArea ? `Delete area ${removingArea.name}?` : ''}
        tone="danger"
        confirmLabel="Delete area"
        pending={pending}
        description={
          removingArea && removingArea.tableCount > 0 ? (
            <>
              This area still holds {removingArea.tableCount} table{removingArea.tableCount === 1 ? '' : 's'}. Move them
              to another area first.
            </>
          ) : (
            'The area is empty, so deleting it changes nothing else.'
          )
        }
        onCancel={() => setRemovingArea(null)}
        onConfirm={() => {
          if (!removingArea) return;
          void run(
            () => api.del(`/api/table-areas/${removingArea.id}`),
            `Area ${removingArea.name} deleted`,
            () => setRemovingArea(null),
          );
        }}
      />
    </div>
  );
}
