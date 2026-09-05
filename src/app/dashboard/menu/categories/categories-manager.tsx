'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { slugify } from '@/lib/format';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  _count: { items: number };
}

type Draft = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  sortOrder: string;
  status: Category['status'];
  isFeatured: boolean;
  metaTitle: string;
  metaDescription: string;
};

const EMPTY: Draft = {
  name: '',
  slug: '',
  description: '',
  imageUrl: null,
  sortOrder: '0',
  status: 'PUBLISHED',
  isFeatured: false,
  metaTitle: '',
  metaDescription: '',
};

export function CategoriesManager({
  categories,
  canManage,
  canDelete,
}: {
  categories: Category[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  function startEdit(category: Category) {
    setEditing(category.id);
    setErrors({});
    setMessage(null);
    setDraft({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      imageUrl: category.imageUrl,
      sortOrder: String(category.sortOrder),
      status: category.status,
      isFeatured: category.isFeatured,
      metaTitle: category.metaTitle ?? '',
      metaDescription: category.metaDescription ?? '',
    });
  }

  function startNew() {
    setEditing('new');
    setErrors({});
    setMessage(null);
    setDraft({ ...EMPTY, sortOrder: String((categories.at(-1)?.sortOrder ?? 0) + 10) });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      name: draft.name.trim(),
      slug: draft.slug.trim() || slugify(draft.name),
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl,
      sortOrder: Number(draft.sortOrder) || 0,
      status: draft.status,
      isFeatured: draft.isFeatured,
      metaTitle: draft.metaTitle.trim() || null,
      metaDescription: draft.metaDescription.trim() || null,
    };
    try {
      if (editing === 'new') await api.post('/api/menu/categories', payload);
      else await api.patch(`/api/menu/categories/${editing}`, payload);
      toast.success('Category saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the category.');
    } finally {
      setPending(false);
    }
  }

  async function reorder(category: Category, direction: -1 | 1) {
    const index = categories.findIndex((c) => c.id === category.id);
    const swap = categories[index + direction];
    if (!swap) return;
    try {
      await Promise.all([
        api.patch(`/api/menu/categories/${category.id}`, { sortOrder: swap.sortOrder }),
        api.patch(`/api/menu/categories/${swap.id}`, { sortOrder: category.sortOrder }),
      ]);
      router.refresh();
    } catch {
      toast.error('Could not reorder');
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/menu/categories/${toDelete.id}`);
      toast.success('Category archived');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive');
    } finally {
      setPending(false);
    }
  }

  const form = (
    <Card>
      <CardHeader>
        <CardTitle>{editing === 'new' ? 'New category' : 'Edit category'}</CardTitle>
        <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: editing === 'new' ? slugify(e.target.value) : d.slug }))}
              placeholder="Biryani & Rice"
            />
          </Field>
          <Field label="Slug" required error={errors.slug} hint="Used in the address: /menu?category=your-slug">
            <Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} />
          </Field>
        </div>

        <Field label="Description" error={errors.description}>
          <Textarea rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </Field>

        <MediaPicker
          slotKey="menu-card"
          label="Category image"
          subFolder={draft.slug || undefined}
          value={draft.imageUrl}
          onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Category['status'] }))}>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field label="Sort order">
            <Input type="number" min="0" value={draft.sortOrder} onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-espresso-700">
              <Checkbox checked={draft.isFeatured} onChange={(e) => setDraft((d) => ({ ...d, isFeatured: e.target.checked }))} />
              Show on home page
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <Spinner /> : null}
            Save category
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-5">
      {canManage && !editing ? (
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          New category
        </Button>
      ) : null}

      {editing ? form : null}

      <Card>
        {categories.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-espresso-400">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-espresso-100">
            {categories.map((category, index) => (
              <li key={category.id} className="flex items-center gap-3 px-5 py-3">
                {canManage ? (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => void reorder(category, -1)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-espresso-300 hover:text-espresso-700 disabled:opacity-30"
                      aria-label={`Move ${category.name} up`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorder(category, 1)}
                      disabled={index === categories.length - 1}
                      className="rounded p-0.5 text-espresso-300 hover:text-espresso-700 disabled:opacity-30"
                      aria-label={`Move ${category.name} down`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-espresso-900">
                    {category.name}
                    <Badge tone={category.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {category.status.toLowerCase()}
                    </Badge>
                    {category.isFeatured ? <Badge tone="accent">home</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-espresso-400">
                    /{category.slug} · {category._count.items} item{category._count.items === 1 ? '' : 's'}
                  </p>
                </div>

                {canManage ? (
                  <Button size="sm" variant="ghost" onClick={() => startEdit(category)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => setToDelete(category)}
                    className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                    aria-label={`Archive ${category.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Archive “${toDelete?.name}”?`}
        confirmLabel="Archive"
        pending={pending}
        description={
          toDelete && toDelete._count.items > 0
            ? `This category still holds ${toDelete._count.items} item(s). Move them to another category first.`
            : 'The category is hidden from the website. Sales history is unaffected.'
        }
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
