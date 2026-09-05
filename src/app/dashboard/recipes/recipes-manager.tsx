'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney, formatQuantity, type CurrencyConfig } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Ingredient {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  isOptional: boolean;
  note: string | null;
}

interface Recipe {
  id: string;
  name: string | null;
  yieldQty: number;
  isActive: boolean;
  autoConsume: boolean;
  note: string | null;
  variant: { id: string; name: string; price: number; menuItemName: string };
  ingredients: Ingredient[];
  foodCost: number;
  costPercent: number | null;
}

interface Line {
  itemId: string;
  quantity: string;
  isOptional: boolean;
}

export function RecipesManager({
  recipes,
  variants,
  ingredients,
  currency,
  consumptionStore,
  canManage,
}: {
  recipes: Recipe[];
  variants: { id: string; label: string; price: number; hasRecipe: boolean }[];
  ingredients: { id: string; name: string; unit: string; unitCost: number }[];
  currency: CurrencyConfig;
  consumptionStore: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Recipe | null>(null);
  const [pending, setPending] = useState(false);

  const available = variants.filter((v) => !v.hasRecipe);

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/recipes/${toDelete.id}`);
      toast.success('Recipe deleted');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the recipe');
    } finally {
      setPending(false);
    }
  }

  async function toggleAuto(recipe: Recipe) {
    try {
      await api.patch(`/api/recipes/${recipe.id}`, { autoConsume: !recipe.autoConsume });
      toast.success(
        !recipe.autoConsume
          ? 'Stock will now be deducted automatically'
          : 'This dish is now tracked by hand',
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update');
    }
  }

  return (
    <div className="space-y-5">
      {canManage && !editing ? (
        <Button onClick={() => setEditing('new')} disabled={available.length === 0}>
          <Plus className="h-4 w-4" />
          {available.length === 0 ? 'Every size already has a recipe' : 'New recipe'}
        </Button>
      ) : null}

      {editing ? (
        <RecipeForm
          recipe={editing === 'new' ? null : editing}
          variants={editing === 'new' ? available : variants}
          ingredients={ingredients}
          currency={currency}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success('Recipe saved');
            router.refresh();
          }}
        />
      ) : null}

      {recipes.length === 0 ? (
        <Card>
          <div className="px-5 py-14 text-center">
            <BookOpen className="mx-auto h-9 w-9 text-espresso-200" />
            <p className="mt-3 text-sm text-espresso-400">
              No recipes yet. A recipe maps one size of a dish to the ingredients it uses, so completing an order can
              deduct them{consumptionStore ? ` from ${consumptionStore}` : ''} and report food cost.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {recipes.map((recipe) => (
            <Card key={recipe.id}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>
                    {recipe.variant.menuItemName}
                    <span className="ml-1.5 font-normal text-espresso-500">· {recipe.variant.name}</span>
                  </CardTitle>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-espresso-400">
                      sells for {formatMoney(recipe.variant.price, currency)}
                    </span>
                    {recipe.costPercent != null ? (
                      <Badge
                        tone={recipe.costPercent > 40 ? 'danger' : recipe.costPercent > 30 ? 'warning' : 'success'}
                      >
                        {recipe.costPercent}% food cost
                      </Badge>
                    ) : null}
                    {!recipe.autoConsume ? <Badge tone="neutral">manual</Badge> : null}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(recipe)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setToDelete(recipe)}
                      className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                      aria-label="Delete recipe"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-espresso-100">
                  {recipe.ingredients.map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className={cn('text-espresso-700', line.isOptional && 'italic text-espresso-400')}>
                        {line.itemName}
                        {line.isOptional ? ' (optional)' : ''}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-espresso-600">
                          {formatQuantity(line.quantity, line.unit)}
                        </span>
                        <span className="w-20 text-right tabular-nums text-espresso-400">
                          {formatMoney(line.quantity * line.unitCost, currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-espresso-100 pt-3">
                  <div>
                    <p className="text-xs text-espresso-400">Cost to make</p>
                    <p className="font-semibold tabular-nums text-espresso-900">
                      {formatMoney(recipe.foodCost, currency)}
                      {recipe.yieldQty !== 1 ? (
                        <span className="ml-1 text-xs font-normal text-espresso-400">per portion</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-espresso-400">Margin</p>
                    <p className="font-semibold tabular-nums text-basil-600">
                      {formatMoney(Math.max(0, recipe.variant.price - recipe.foodCost), currency)}
                    </p>
                  </div>
                </div>

                {canManage ? (
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-cream-50 px-3 py-2 text-sm">
                    <span>
                      <span className="block font-medium text-espresso-800">Deduct stock automatically</span>
                      <span className="block text-xs text-espresso-400">
                        When an order completes{consumptionStore ? `, from ${consumptionStore}` : ''}
                      </span>
                    </span>
                    <Toggle
                      checked={recipe.autoConsume}
                      onChange={() => void toggleAuto(recipe)}
                      label={`Auto-consume for ${recipe.variant.menuItemName}`}
                    />
                  </label>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete the recipe for ${toDelete?.variant.menuItemName} ${toDelete?.variant.name}?`}
        confirmLabel="Delete"
        pending={pending}
        description="Stock will stop being deducted for this size when an order completes. Past movements are unaffected."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function RecipeForm({
  recipe,
  variants,
  ingredients,
  currency,
  onClose,
  onDone,
}: {
  recipe: Recipe | null;
  variants: { id: string; label: string; price: number; hasRecipe: boolean }[];
  ingredients: { id: string; name: string; unit: string; unitCost: number }[];
  currency: CurrencyConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const [variantId, setVariantId] = useState(recipe?.variant.id ?? variants[0]?.id ?? '');
  const [yieldQty, setYieldQty] = useState(String(recipe?.yieldQty ?? 1));
  const [autoConsume, setAutoConsume] = useState(recipe?.autoConsume ?? true);
  const [note, setNote] = useState(recipe?.note ?? '');
  const [lines, setLines] = useState<Line[]>(
    recipe
      ? recipe.ingredients.map((i) => ({ itemId: i.itemId, quantity: String(i.quantity), isOptional: i.isOptional }))
      : [{ itemId: '', quantity: '', isOptional: false }],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const cost = useMemo(() => {
    const total = lines.reduce((sum, line) => {
      const item = ingredients.find((i) => i.id === line.itemId);
      if (!item || line.isOptional) return sum;
      return sum + (Number(line.quantity) || 0) * item.unitCost;
    }, 0);
    return total / Math.max(1, Number(yieldQty) || 1);
  }, [lines, ingredients, yieldQty]);

  const price = variants.find((v) => v.id === variantId)?.price ?? recipe?.variant.price ?? 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    const usable = lines.filter((line) => line.itemId && Number(line.quantity) > 0);
    if (usable.length === 0) {
      setMessage('Add at least one ingredient with a quantity.');
      setPending(false);
      return;
    }

    const payload = {
      variantId,
      yieldQty: Number(yieldQty) || 1,
      autoConsume,
      note: note.trim() || null,
      ingredients: usable.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        isOptional: line.isOptional,
      })),
    };

    try {
      if (recipe) await api.patch(`/api/recipes/${recipe.id}`, payload);
      else await api.post('/api/recipes', payload);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the recipe.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{recipe ? 'Edit recipe' : 'New recipe'}</CardTitle>
        <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {message ? <Alert tone="danger">{message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dish and size" required error={errors.variantId}>
              <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} required disabled={Boolean(recipe)}>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {formatMoney(v.price, currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Portions this makes" hint="Usually 1. Use a batch size for things you cook in bulk.">
              <Input type="number" min="1" step="1" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-espresso-800">Ingredients</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((prev) => [...prev, { itemId: '', quantity: '', isOptional: false }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            <ul className="space-y-2">
              {lines.map((line, index) => {
                const item = ingredients.find((i) => i.id === line.itemId);
                return (
                  <li key={index} className="grid gap-2 rounded-lg border border-espresso-100 bg-cream-50 p-3 sm:grid-cols-[1fr_130px_auto_auto] sm:items-center">
                    <Select
                      value={line.itemId}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === index ? { ...l, itemId: e.target.value } : l)))
                      }
                      aria-label={`Ingredient ${index + 1}`}
                    >
                      <option value="">Choose an ingredient</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                    </Select>

                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))
                      }
                      placeholder={item?.unit ?? 'qty'}
                      aria-label={`Quantity for ingredient ${index + 1}`}
                    />

                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-espresso-600">
                      <Checkbox
                        checked={line.isOptional}
                        onChange={(e) =>
                          setLines((prev) => prev.map((l, i) => (i === index ? { ...l, isOptional: e.target.checked } : l)))
                        }
                      />
                      Optional
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="min-w-20 text-right text-xs tabular-nums text-espresso-500">
                        {item ? formatMoney((Number(line.quantity) || 0) * item.unitCost, currency) : '—'}
                      </span>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                          className="rounded p-1.5 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                          aria-label={`Remove ingredient ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-espresso-400">
              Optional ingredients are shown on the recipe but never deducted automatically.
            </p>
          </div>

          <div className="rounded-lg bg-cream-100 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-espresso-500">Cost to make one portion</span>
              <span className="font-semibold tabular-nums text-espresso-900">{formatMoney(cost, currency)}</span>
            </div>
            {price > 0 ? (
              <div className="mt-1 flex justify-between">
                <span className="text-espresso-500">Food cost as a share of price</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    (cost / price) * 100 > 40 ? 'text-chilli-600' : 'text-basil-600',
                  )}
                >
                  {((cost / price) * 100).toFixed(1)}%
                </span>
              </div>
            ) : null}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-espresso-100 px-3 py-2.5 text-sm">
            <span>
              <span className="block font-medium text-espresso-800">Deduct stock automatically</span>
              <span className="block text-xs text-espresso-400">
                Turn off if the kitchen tracks this dish by hand.
              </span>
            </span>
            <Toggle checked={autoConsume} onChange={setAutoConsume} label="Deduct stock automatically" />
          </label>

          <Field label="Note" hint="Method, plating, anything the kitchen should remember.">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Save recipe
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
