'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { StatCard } from '@/components/dashboard/stat-card';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDate, formatMoney, type CurrencyConfig } from '@/lib/format';

interface Expense {
  id: string;
  title: string;
  amount: number;
  expenseDate: string;
  reference: string | null;
  note: string | null;
  category: { id: string; name: string; kind: string };
}

export function ExpensesManager({
  expenses,
  categories,
  currency,
  timezone,
  locale,
  canManage,
}: {
  expenses: Expense[];
  categories: { id: string; name: string; kind: string }[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [pending, setPending] = useState(false);

  const summary = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category.name, (byCategory.get(e.category.name) ?? 0) + e.amount);
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total, count: expenses.length, topName: top?.[0] ?? '—', topValue: top?.[1] ?? 0 };
  }, [expenses]);

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/finance/expenses/${toDelete.id}`);
      toast.success('Expense removed');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the expense');
    } finally {
      setPending(false);
    }
  }

  const columns: Column<Expense>[] = [
    {
      key: 'title',
      header: 'Expense',
      render: (e) => (
        <div>
          <p className="font-medium text-espresso-900">{e.title}</p>
          <p className="text-xs text-espresso-400">
            {e.reference ? `ref ${e.reference}` : e.note ? e.note.slice(0, 60) : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => <Badge tone="neutral">{e.category.name}</Badge>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (e) => <span className="text-sm text-espresso-600">{formatDate(e.expenseDate, timezone, locale)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (e) => (
        <span className="font-medium tabular-nums text-espresso-900">{formatMoney(e.amount, currency)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => setToDelete(e)}
              className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
              aria-label={`Remove ${e.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="This month" value={formatMoney(summary.total, currency)} icon="Receipt" tone="warning" />
        <StatCard label="Entries" value={summary.count} icon="List" />
        <StatCard label="Biggest category" value={summary.topName} sublabel={formatMoney(summary.topValue, currency)} icon="ChartPie" />
      </div>

      {canManage && !editing ? (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          Record an expense
        </Button>
      ) : null}

      {editing ? (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success('Expense saved');
            router.refresh();
          }}
        />
      ) : null}

      <Card>
        <DataTable columns={columns} rows={expenses} emptyMessage="No expenses recorded this month." />
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove “${toDelete?.title}”?`}
        confirmLabel="Remove"
        pending={pending}
        description="The entry is hidden from reports. The removal is recorded in the audit log."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function ExpenseForm({
  expense,
  categories,
  onClose,
  onDone,
}: {
  expense: Expense | null;
  categories: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState({
    categoryId: expense?.category.id ?? categories[0]?.id ?? '',
    title: expense?.title ?? '',
    amount: expense ? String(expense.amount) : '',
    date: expense ? expense.expenseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    reference: expense?.reference ?? '',
    note: expense?.note ?? '',
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
      categoryId: values.categoryId,
      title: values.title.trim(),
      amount: Number(values.amount),
      expenseDate: new Date(`${values.date}T12:00:00`).toISOString(),
      reference: values.reference.trim() || null,
      note: values.note.trim() || null,
    };
    try {
      if (expense) await api.patch(`/api/finance/expenses/${expense.id}`, payload);
      else await api.post('/api/finance/expenses', payload);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the expense.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{expense ? 'Edit expense' : 'Record an expense'}</CardTitle>
        <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {message ? <Alert tone="danger">{message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What was it for" required error={errors.title}>
              <Input
                value={values.title}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                placeholder="Electricity bill — August"
                required
              />
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              <Select value={values.categoryId} onChange={(e) => setValues((v) => ({ ...v, categoryId: e.target.value }))} required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount" required error={errors.amount}>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={values.amount}
                onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
                required
              />
            </Field>
            <Field label="Date" required error={errors.expenseDate}>
              <Input type="date" value={values.date} onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))} required />
            </Field>
            <Field label="Reference" error={errors.reference} hint="Bill or receipt number">
              <Input value={values.reference} onChange={(e) => setValues((v) => ({ ...v, reference: e.target.value }))} />
            </Field>
          </div>

          <Field label="Note">
            <Textarea rows={2} value={values.note} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Save expense
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
