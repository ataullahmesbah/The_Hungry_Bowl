'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { Alert, Card, CardBody, CardHeader, CardTitle, CardDescription, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import type { UploadedAsset } from '@/components/media/use-upload';
import { ApiError, api } from '@/lib/client/api-client';
import { slugify } from '@/lib/format';
import type { CurrencyConfig } from '@/lib/format';
import { formatMoney } from '@/lib/format';

export interface VariantDraft {
  id?: string;
  name: string;
  code: string;
  price: string;
  portionLabel: string;
  isAvailable: boolean;
  isDefault: boolean;
}

export interface MenuItemFormValues {
  name: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isAvailable: boolean;
  isFeatured: boolean;
  isTodaysSpecial: boolean;
  isNew: boolean;
  priceDisplayMode: 'FIXED' | 'RANGE' | 'HIDDEN';
  basePrice: string;
  isVegetarian: boolean;
  isVegan: boolean;
  isHalal: boolean;
  spiceLevel: number;
  allergens: string;
  calories: string;
  prepMinutes: string;
  sortOrder: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  variants: VariantDraft[];
  addOnGroupIds: string[];
  media: UploadedAsset[];
}

export const EMPTY_ITEM: MenuItemFormValues = {
  name: '',
  slug: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  status: 'PUBLISHED',
  isAvailable: true,
  isFeatured: false,
  isTodaysSpecial: false,
  isNew: false,
  priceDisplayMode: 'FIXED',
  basePrice: '',
  isVegetarian: false,
  isVegan: false,
  isHalal: true,
  spiceLevel: 0,
  allergens: '',
  calories: '',
  prepMinutes: '',
  sortOrder: '0',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
  variants: [{ name: 'Regular', code: '', price: '', portionLabel: '', isAvailable: true, isDefault: true }],
  addOnGroupIds: [],
  media: [],
};

const SPICE_OPTIONS = ['Not spicy', 'Mild', 'Medium', 'Hot', 'Very hot'];

export function MenuItemForm({
  itemId,
  initial,
  categories,
  addOnGroups,
  currency,
}: {
  itemId?: string;
  initial: MenuItemFormValues;
  categories: { id: string; name: string }[];
  addOnGroups: { id: string; name: string; selectionType: string; addOns: { name: string; price: number }[] }[];
  currency: CurrencyConfig;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<MenuItemFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [confirmArchive, setConfirmArchive] = useState(false);

  function set<K extends keyof MenuItemFormValues>(key: K, value: MenuItemFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setVariant(index: number, patch: Partial<VariantDraft>) {
    setValues((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  const priceHint = useMemo(() => {
    const prices = values.variants
      .filter((v) => v.isAvailable)
      .map((v) => Number(v.price))
      .filter((p) => Number.isFinite(p) && p > 0);

    if (values.priceDisplayMode === 'HIDDEN') return 'Customers will see no price at all — the card says “Ask our staff”.';
    if (values.priceDisplayMode === 'RANGE') {
      if (prices.length < 2) return 'Add at least two priced sizes to show a range.';
      return `Customers will see ${formatMoney(Math.min(...prices), currency)} – ${formatMoney(Math.max(...prices), currency)}`;
    }
    const base = Number(values.basePrice);
    if (base > 0) return `Customers will see ${formatMoney(base, currency)}`;
    if (prices.length) return `Customers will see ${formatMoney(Math.min(...prices), currency)}`;
    return 'Enter a price, or switch the display mode to Hidden.';
  }, [values.priceDisplayMode, values.basePrice, values.variants, currency]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    const payload = {
      name: values.name.trim(),
      slug: values.slug.trim() || slugify(values.name),
      categoryId: values.categoryId,
      shortDescription: values.shortDescription.trim() || null,
      description: values.description.trim() || null,
      status: values.status,
      isAvailable: values.isAvailable,
      isFeatured: values.isFeatured,
      isTodaysSpecial: values.isTodaysSpecial,
      isNew: values.isNew,
      priceDisplayMode: values.priceDisplayMode,
      basePrice: values.basePrice ? Number(values.basePrice) : null,
      isVegetarian: values.isVegetarian,
      isVegan: values.isVegan,
      isHalal: values.isHalal,
      spiceLevel: values.spiceLevel,
      allergens: values.allergens
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      calories: values.calories ? Number(values.calories) : null,
      prepMinutes: values.prepMinutes ? Number(values.prepMinutes) : null,
      sortOrder: Number(values.sortOrder) || 0,
      metaTitle: values.metaTitle.trim() || null,
      metaDescription: values.metaDescription.trim() || null,
      metaKeywords: values.metaKeywords.trim() || null,
      variants: values.variants.map((v, index) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        code: v.code.trim() || null,
        price: Number(v.price) || 0,
        portionLabel: v.portionLabel.trim() || null,
        isAvailable: v.isAvailable,
        isDefault: v.isDefault,
        sortOrder: index,
      })),
      addOnGroupIds: values.addOnGroupIds,
      mediaIds: values.media.map((m) => m.id),
    };

    try {
      if (itemId) {
        await api.patch(`/api/menu/items/${itemId}`, payload);
        toast.success('Menu item saved');
      } else {
        const created = await api.post<{ id: string }>('/api/menu/items', payload);
        toast.success('Menu item created');
        router.push(`/dashboard/menu/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else {
        setMessage('Could not save. Check your connection and try again.');
      }
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    setPending(true);
    try {
      await api.del(`/api/menu/items/${itemId}`);
      toast.success('Item archived');
      router.push('/dashboard/menu');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive this item');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px]" noValidate>
      <div className="space-y-5">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        {/* ---------------------------------------------------------- Basics */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Basics</CardTitle>
              <CardDescription>What the dish is called and where it sits on the menu.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Name" htmlFor="name" required error={errors.name}>
              <Input
                id="name"
                required
                maxLength={160}
                value={values.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  if (!slugTouched) set('slug', slugify(e.target.value));
                }}
                placeholder="Chicken Dominator"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Web address (slug)"
                htmlFor="slug"
                required
                error={errors.slug}
                hint="This becomes /menu/your-slug — changing it breaks old links."
              >
                <Input
                  id="slug"
                  required
                  value={values.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', slugify(e.target.value));
                  }}
                />
              </Field>

              <Field label="Category" htmlFor="categoryId" required error={errors.categoryId}>
                <Select
                  id="categoryId"
                  required
                  value={values.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  <option value="">Choose a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Short description"
              htmlFor="shortDescription"
              error={errors.shortDescription}
              hint="One line shown on the menu card. Keep it under about 120 characters."
            >
              <Input
                id="shortDescription"
                maxLength={300}
                value={values.shortDescription}
                onChange={(e) => set('shortDescription', e.target.value)}
                placeholder="Loaded chicken pizza with four toppings."
              />
            </Field>

            <Field label="Full description" htmlFor="description" error={errors.description}>
              <Textarea
                id="description"
                rows={4}
                maxLength={6000}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe the dish the way you would to a guest at the table."
              />
            </Field>
          </CardBody>
        </Card>

        {/* ----------------------------------------------------------- Media */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Photos</CardTitle>
              <CardDescription>The first photo is used on the menu card.</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            <MediaPicker
              slotKey="menu-card"
              multiple
              subFolder={values.slug || undefined}
              values={values.media}
              onChangeMultiple={(assets) => set('media', assets)}
            />
          </CardBody>
        </Card>

        {/* -------------------------------------------------- Pricing & sizes */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Price &amp; sizes</CardTitle>
              <CardDescription>
                One item, many sizes. Never create a separate menu item for Regular, Medium and Large.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How the price is shown" htmlFor="priceDisplayMode" error={errors.priceDisplayMode}>
                <Select
                  id="priceDisplayMode"
                  value={values.priceDisplayMode}
                  onChange={(e) => set('priceDisplayMode', e.target.value as MenuItemFormValues['priceDisplayMode'])}
                >
                  <option value="FIXED">Fixed — one price</option>
                  <option value="RANGE">Range — from the cheapest to the dearest size</option>
                  <option value="HIDDEN">Hidden — no price on the website</option>
                </Select>
              </Field>

              {values.priceDisplayMode === 'FIXED' ? (
                <Field label="Price" htmlFor="basePrice" error={errors.basePrice}>
                  <Input
                    id="basePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={values.basePrice}
                    onChange={(e) => set('basePrice', e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              ) : null}
            </div>

            <Alert tone="info">{priceHint}</Alert>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-espresso-800">Sizes / variants</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set('variants', [
                      ...values.variants,
                      { name: '', code: '', price: '', portionLabel: '', isAvailable: true, isDefault: false },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add size
                </Button>
              </div>

              {errors.variants ? <p className="mb-2 text-xs text-chilli-600">{errors.variants}</p> : null}

              <ul className="space-y-2">
                {values.variants.map((variant, index) => (
                  <li key={index} className="rounded-lg border border-espresso-100 bg-cream-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[16px_1fr_90px_110px_120px_auto] sm:items-center">
                      <GripVertical className="hidden h-4 w-4 text-espresso-300 sm:block" aria-hidden />

                      <Input
                        aria-label={`Size ${index + 1} name`}
                        value={variant.name}
                        onChange={(e) => setVariant(index, { name: e.target.value })}
                        placeholder="Large"
                      />
                      <Input
                        aria-label={`Size ${index + 1} short code`}
                        value={variant.code}
                        onChange={(e) => setVariant(index, { code: e.target.value })}
                        placeholder="L"
                        maxLength={10}
                      />
                      <Input
                        aria-label={`Size ${index + 1} price`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={variant.price}
                        onChange={(e) => setVariant(index, { price: e.target.value })}
                        placeholder="0.00"
                      />
                      <Input
                        aria-label={`Size ${index + 1} portion label`}
                        value={variant.portionLabel}
                        onChange={(e) => setVariant(index, { portionLabel: e.target.value })}
                        placeholder="12 inch"
                      />

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-espresso-600">
                          <Checkbox
                            checked={variant.isDefault}
                            onChange={() =>
                              setValues((prev) => ({
                                ...prev,
                                variants: prev.variants.map((v, i) => ({ ...v, isDefault: i === index })),
                              }))
                            }
                          />
                          Default
                        </label>
                        {values.variants.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                'variants',
                                values.variants.filter((_, i) => i !== index),
                              )
                            }
                            className="rounded p-1.5 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                            aria-label={`Remove size ${variant.name || index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <label className="mt-2 flex items-center gap-2 text-xs text-espresso-600">
                      <Toggle
                        checked={variant.isAvailable}
                        onChange={(next) => setVariant(index, { isAvailable: next })}
                        label={`Availability of ${variant.name || 'this size'}`}
                      />
                      {variant.isAvailable ? 'Available' : 'This size is off today'}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- Add-ons */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Add-ons &amp; extras</CardTitle>
              <CardDescription>Reusable groups such as “Choose Salad” or “Extras”.</CardDescription>
            </div>
            <Link href="/dashboard/menu/addons" className="text-xs font-medium text-saffron-700 hover:underline">
              Manage groups
            </Link>
          </CardHeader>
          <CardBody>
            {addOnGroups.length === 0 ? (
              <p className="text-sm text-espresso-400">
                No add-on groups yet.{' '}
                <Link href="/dashboard/menu/addons" className="text-saffron-700 underline">
                  Create one
                </Link>{' '}
                to offer extras with this dish.
              </p>
            ) : (
              <ul className="space-y-2">
                {addOnGroups.map((group) => {
                  const checked = values.addOnGroupIds.includes(group.id);
                  return (
                    <li key={group.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-espresso-100 p-3 hover:bg-cream-50">
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onChange={() =>
                            set(
                              'addOnGroupIds',
                              checked
                                ? values.addOnGroupIds.filter((id) => id !== group.id)
                                : [...values.addOnGroupIds, group.id],
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-espresso-900">
                            {group.name}
                            <span className="ml-2 text-xs font-normal text-espresso-400">
                              {group.selectionType === 'SINGLE' ? 'choose one' : 'choose any'}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-espresso-400">
                            {group.addOns.map((a) => a.name).join(' · ')}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- Details */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Dietary &amp; kitchen details</CardTitle>
              <CardDescription>Shown on the dish page and used on kitchen tickets.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['isVegetarian', 'Vegetarian'],
                  ['isVegan', 'Vegan'],
                  ['isHalal', 'Halal'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-espresso-700">
                  <Checkbox checked={values[key]} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Spice level" htmlFor="spiceLevel">
                <Select
                  id="spiceLevel"
                  value={String(values.spiceLevel)}
                  onChange={(e) => set('spiceLevel', Number(e.target.value))}
                >
                  {SPICE_OPTIONS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Prep time (minutes)" htmlFor="prepMinutes" error={errors.prepMinutes}>
                <Input
                  id="prepMinutes"
                  type="number"
                  min="0"
                  value={values.prepMinutes}
                  onChange={(e) => set('prepMinutes', e.target.value)}
                />
              </Field>

              <Field label="Calories" htmlFor="calories" error={errors.calories}>
                <Input
                  id="calories"
                  type="number"
                  min="0"
                  value={values.calories}
                  onChange={(e) => set('calories', e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Allergens"
              htmlFor="allergens"
              hint="Separate with commas, e.g. Dairy, Nuts, Gluten"
              error={errors.allergens}
            >
              <Input
                id="allergens"
                value={values.allergens}
                onChange={(e) => set('allergens', e.target.value)}
                placeholder="Dairy, Gluten"
              />
            </Field>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------------- SEO */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Search engine listing</CardTitle>
              <CardDescription>How this dish appears in Google. Leave blank to use the name and short description.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Meta title" htmlFor="metaTitle" hint={`${values.metaTitle.length}/60 characters is ideal`}>
              <Input
                id="metaTitle"
                maxLength={160}
                value={values.metaTitle}
                onChange={(e) => set('metaTitle', e.target.value)}
                placeholder={values.name ? `${values.name} — order at our restaurant` : ''}
              />
            </Field>
            <Field
              label="Meta description"
              htmlFor="metaDescription"
              hint={`${values.metaDescription.length}/160 characters is ideal`}
            >
              <Textarea
                id="metaDescription"
                rows={2}
                maxLength={320}
                value={values.metaDescription}
                onChange={(e) => set('metaDescription', e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Sidebar */}
      <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Publishing</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={values.status}
                onChange={(e) => set('status', e.target.value as MenuItemFormValues['status'])}
              >
                <option value="PUBLISHED">Published — visible on the website</option>
                <option value="DRAFT">Draft — hidden from customers</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>

            <div className="space-y-3 border-t border-espresso-100 pt-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium text-espresso-800">Available today</span>
                  <span className="block text-xs text-espresso-400">Off = shown as unavailable, not deleted</span>
                </span>
                <Toggle checked={values.isAvailable} onChange={(v) => set('isAvailable', v)} label="Available today" />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-espresso-800">Featured</span>
                <Toggle checked={values.isFeatured} onChange={(v) => set('isFeatured', v)} label="Featured" />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-espresso-800">Today’s special</span>
                <Toggle checked={values.isTodaysSpecial} onChange={(v) => set('isTodaysSpecial', v)} label="Today's special" />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-espresso-800">Mark as new</span>
                <Toggle checked={values.isNew} onChange={(v) => set('isNew', v)} label="Mark as new" />
              </label>
            </div>

            <Field label="Sort order" htmlFor="sortOrder" hint="Lower numbers appear first in the category.">
              <Input
                id="sortOrder"
                type="number"
                min="0"
                value={values.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="space-y-2">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Spinner /> : <Save className="h-4 w-4" />}
            {pending ? 'Saving…' : itemId ? 'Save changes' : 'Create item'}
          </Button>

          {itemId && values.slug ? (
            <Link href={`/menu/${values.slug}`} target="_blank" rel="noreferrer" className="block">
              <Button type="button" variant="outline" className="w-full">
                <ExternalLink className="h-4 w-4" />
                View on website
              </Button>
            </Link>
          ) : null}

          {itemId ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-chilli-600 hover:bg-red-50"
              onClick={() => setConfirmArchive(true)}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
              Archive this item
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive “${values.name}”?`}
        confirmLabel="Archive"
        confirmWord={values.name}
        pending={pending}
        description="Archiving hides the dish from the website and from order entry. Past orders and reports keep it, so nothing in your sales history changes. You can restore it later."
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void archive()}
      />
    </form>
  );
}
