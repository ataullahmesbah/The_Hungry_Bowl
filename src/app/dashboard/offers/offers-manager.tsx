'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDate, slugify, type CurrencyConfig } from '@/lib/format';

interface Offer {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  imageUrl: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'SPECIAL_PRICE' | 'COMBO' | 'INFO_ONLY';
  value: number | null;
  couponCode: string | null;
  terms: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  startsAt: string | null;
  endsAt: string | null;
  isFeatured: boolean;
  sortOrder: number;
}

interface Draft {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  imageUrl: string | null;
  type: Offer['type'];
  value: string;
  couponCode: string;
  terms: string;
  status: Offer['status'];
  startsAt: string;
  endsAt: string;
  isFeatured: boolean;
  sortOrder: string;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  imageUrl: null,
  type: 'PERCENTAGE',
  value: '',
  couponCode: '',
  terms: '',
  status: 'PUBLISHED',
  startsAt: '',
  endsAt: '',
  isFeatured: false,
  sortOrder: '0',
};

/** <input type="datetime-local"> needs a local, second-less value. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function OffersManager({
  offers,
  currency,
  timezone,
  locale,
  canManage,
}: {
  offers: Offer[];
  currency: CurrencyConfig;
  timezone: string;
  locale: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<Offer | null>(null);

  function startEdit(offer: Offer) {
    setEditing(offer.id);
    setErrors({});
    setMessage(null);
    setDraft({
      title: offer.title,
      slug: offer.slug,
      subtitle: offer.subtitle ?? '',
      description: offer.description ?? '',
      imageUrl: offer.imageUrl,
      type: offer.type,
      value: offer.value != null ? String(offer.value) : '',
      couponCode: offer.couponCode ?? '',
      terms: offer.terms ?? '',
      status: offer.status,
      startsAt: toLocalInput(offer.startsAt),
      endsAt: toLocalInput(offer.endsAt),
      isFeatured: offer.isFeatured,
      sortOrder: String(offer.sortOrder),
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || slugify(draft.title),
      subtitle: draft.subtitle.trim() || null,
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl,
      type: draft.type,
      value: draft.value ? Number(draft.value) : null,
      couponCode: draft.couponCode.trim() || null,
      terms: draft.terms.trim() || null,
      status: draft.status,
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      isFeatured: draft.isFeatured,
      sortOrder: Number(draft.sortOrder) || 0,
    };
    try {
      if (editing === 'new') await api.post('/api/cms/offers', payload);
      else await api.patch(`/api/cms/offers/${editing}`, payload);
      toast.success('Offer saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the offer.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/cms/offers/${toDelete.id}`);
      toast.success('Offer archived');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive');
    } finally {
      setPending(false);
    }
  }

  const needsValue = ['PERCENTAGE', 'FIXED_AMOUNT', 'SPECIAL_PRICE'].includes(draft.type);

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
          New offer
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New offer' : 'Edit offer'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" required error={errors.title}>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value, slug: editing === 'new' ? slugify(e.target.value) : d.slug }))}
                  placeholder="Family Feast Friday"
                />
              </Field>
              <Field label="Slug" required error={errors.slug}>
                <Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} />
              </Field>
            </div>

            <Field label="Subtitle" error={errors.subtitle} hint="One line shown under the title.">
              <Input value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} />
            </Field>

            <Field label="Description" error={errors.description}>
              <Textarea rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </Field>

            <MediaPicker
              slotKey="offer"
              label="Offer banner"
              subFolder={draft.slug || undefined}
              value={draft.imageUrl}
              onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Offer type" error={errors.type}>
                <Select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as Offer['type'] }))}>
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                  <option value="SPECIAL_PRICE">Special price</option>
                  <option value="COMBO">Combo</option>
                  <option value="INFO_ONLY">Information only</option>
                </Select>
              </Field>
              {needsValue ? (
                <Field
                  label={draft.type === 'PERCENTAGE' ? 'Percentage' : 'Amount'}
                  required
                  error={errors.value}
                  hint={draft.type === 'PERCENTAGE' ? '15 means 15% off' : `In ${currency.currencyCode}`}
                >
                  <Input type="number" min="0" step="0.01" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} />
                </Field>
              ) : null}
              <Field label="Coupon code" error={errors.couponCode} hint="Optional — leave blank if none.">
                <Input value={draft.couponCode} onChange={(e) => setDraft((d) => ({ ...d, couponCode: e.target.value.toUpperCase() }))} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" error={errors.startsAt} hint="Leave blank to start immediately.">
                <Input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))} />
              </Field>
              <Field label="Ends" error={errors.endsAt} hint="Leave blank to run until you archive it.">
                <Input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))} />
              </Field>
            </div>

            <Field label="Terms & conditions" error={errors.terms}>
              <Textarea rows={2} value={draft.terms} onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))} placeholder="Dine-in only. Not valid with other offers." />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Offer['status'] }))}>
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
                Save offer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        {offers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-espresso-400">No offers yet.</p>
        ) : (
          <ul className="divide-y divide-espresso-100">
            {offers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-espresso-900">
                    {offer.title}
                    <Badge tone={offer.status === 'PUBLISHED' ? 'success' : 'neutral'}>{offer.status.toLowerCase()}</Badge>
                    {offer.isFeatured ? <Badge tone="accent">home</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-espresso-400">
                    {offer.subtitle ?? '—'}
                    {offer.endsAt ? ` · until ${formatDate(offer.endsAt, timezone, locale)}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(offer)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => setToDelete(offer)}
                      className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                      aria-label={`Archive ${offer.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Archive “${toDelete?.title}”?`}
        confirmLabel="Archive"
        pending={pending}
        description="The offer is removed from the website immediately. It stays in your records."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
