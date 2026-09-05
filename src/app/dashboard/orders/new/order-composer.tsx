'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Search, Send, ShoppingCart, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney, type CurrencyConfig } from '@/lib/format';
import { cldUrl } from '@/lib/cloudinary/url';
import { cn } from '@/lib/utils';

interface AddOn {
  id: string;
  name: string;
  price: number;
  isDefault: boolean;
}

interface AddOnGroup {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number | null;
  addOns: AddOn[];
}

interface MenuItem {
  id: string;
  name: string;
  basePrice: number | null;
  priceDisplayMode: string;
  variants: { id: string; name: string; price: number; isDefault: boolean }[];
  addOnGroups: { group: AddOnGroup }[];
  media: { media: { secureUrl: string } }[];
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface CartLine {
  key: string;
  menuItemId: string;
  itemName: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  addOns: { id: string; name: string; price: number }[];
  note: string;
}

/**
 * Till screen for floor staff.
 *
 * Totals shown here are a preview only — the server recomputes every price
 * from the database when the order is submitted, so a tampered browser cannot
 * change what the customer is charged.
 */
export function OrderComposer({
  categories,
  sessions,
  customers,
  currency,
  taxPercent,
  serviceChargePercent,
  taxLabel,
  initialSessionId,
}: {
  categories: Category[];
  sessions: { id: string; code: string; label: string; guestCount: number; orderCount: number }[];
  customers: { id: string; name: string; phone: string | null }[];
  currency: CurrencyConfig;
  taxPercent: number;
  serviceChargePercent: number;
  taxLabel: string;
  initialSessionId: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>(
    initialSessionId || sessions.length > 0 ? 'DINE_IN' : 'TAKEAWAY',
  );
  const [sessionId, setSessionId] = useState(initialSessionId || sessions[0]?.id || '');
  const [customerId, setCustomerId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [orderNote, setOrderNote] = useState('');

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [configuring, setConfiguring] = useState<MenuItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return categories.flatMap((c) => c.items).filter((item) => item.name.toLowerCase().includes(q));
    }
    return categories.find((c) => c.id === activeCategory)?.items ?? [];
  }, [categories, activeCategory, search]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, line) => sum + (line.unitPrice + line.addOns.reduce((a, o) => a + o.price, 0)) * line.quantity,
      0,
    );
    const serviceCharge = (subtotal * serviceChargePercent) / 100;
    const tax = ((subtotal + serviceCharge) * taxPercent) / 100;
    return { subtotal, serviceCharge, tax, total: subtotal + serviceCharge + tax };
  }, [cart, taxPercent, serviceChargePercent]);

  function addToCart(item: MenuItem, variantId: string | null, addOns: AddOn[], note: string) {
    const variant = item.variants.find((v) => v.id === variantId) ?? null;
    const unitPrice = variant ? variant.price : Number(item.basePrice ?? 0);
    const addOnKey = addOns.map((a) => a.id).sort().join(',');
    const key = `${item.id}:${variantId ?? ''}:${addOnKey}:${note}`;

    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          itemName: item.name,
          variantId,
          variantName: variant?.name ?? null,
          unitPrice,
          quantity: 1,
          addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: a.price })),
          note,
        },
      ];
    });
  }

  function quickAdd(item: MenuItem) {
    const needsChoice =
      item.variants.length > 1 ||
      item.addOnGroups.some((g) => g.group.addOns.length > 0);
    if (needsChoice) {
      setConfiguring(item);
      return;
    }
    addToCart(item, item.variants[0]?.id ?? null, [], '');
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function submit(sendToKitchen: boolean) {
    setPending(true);
    setMessage(null);

    if (cart.length === 0) {
      setMessage('Add at least one item before sending the order.');
      setPending(false);
      return;
    }
    if (orderType === 'DINE_IN' && !sessionId) {
      setMessage('Choose the table the guests are sitting at.');
      setPending(false);
      return;
    }

    try {
      const created = await api.post<{ id: string; orderNumber: string; secretCode: string }>('/api/orders', {
        type: orderType,
        sessionId: orderType === 'DINE_IN' ? sessionId : null,
        customerId: customerId || null,
        guestName: guestName.trim() || null,
        guestPhone: guestPhone.trim() || null,
        guestCount: sessions.find((s) => s.id === sessionId)?.guestCount ?? 1,
        note: orderNote.trim() || null,
        sendToKitchen,
        lines: cart.map((line) => ({
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          quantity: line.quantity,
          addOnIds: line.addOns.map((a) => a.id),
          note: line.note || null,
        })),
      });

      toast.success(
        `Order #${created.orderNumber} created`,
        sendToKitchen ? `Code ${created.secretCode} — sent to the kitchen.` : `Code ${created.secretCode} — saved as a draft.`,
      );
      router.push(`/dashboard/orders/${created.id}`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not create the order.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {/* ------------------------------------------------------- Menu picker */}
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Order type">
                <Select value={orderType} onChange={(e) => setOrderType(e.target.value as 'DINE_IN' | 'TAKEAWAY')}>
                  <option value="DINE_IN">Dine-in</option>
                  <option value="TAKEAWAY">Takeaway</option>
                </Select>
              </Field>

              {orderType === 'DINE_IN' ? (
                <Field label="Table / party" required hint="Orders join this party's single bill.">
                  <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                    <option value="">Choose a seated table</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.code}){s.orderCount > 0 ? ` · ${s.orderCount} order(s) already` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Customer name" hint="Optional">
                  <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} />
                </Field>
              )}
            </div>

            {orderType === 'TAKEAWAY' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone" hint="Optional">
                  <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} maxLength={24} />
                </Field>
                <Field label="Existing customer" hint="Optional">
                  <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Not linked</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-espresso-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the menu"
            className="pl-9"
          />
        </div>

        {!search ? (
          <div className="flex gap-1 overflow-x-auto pb-1 scroll-slim">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors',
                  activeCategory === category.id
                    ? 'bg-espresso-900 font-medium text-cream-50'
                    : 'bg-white text-espresso-600 hover:bg-cream-200',
                )}
              >
                {category.name}
                <span className="ml-1.5 text-xs opacity-60">{category.items.length}</span>
              </button>
            ))}
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <Card>
            <p className="px-5 py-14 text-center text-sm text-espresso-400">
              Nothing here. Items switched off by a manager do not appear on this screen.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => {
              const defaultVariant = item.variants.find((v) => v.isDefault) ?? item.variants[0];
              const price = defaultVariant?.price ?? Number(item.basePrice ?? 0);
              const hasChoices = item.variants.length > 1 || item.addOnGroups.length > 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => quickAdd(item)}
                  className="group overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white text-left transition-shadow hover:shadow-md"
                >
                  {item.media[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cldUrl(item.media[0].media.secureUrl, { width: 300, height: 200 })}
                      alt=""
                      className="h-24 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-24 w-full bg-cream-200" />
                  )}
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-espresso-900">{item.name}</p>
                    <p className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums text-espresso-900">
                        {price > 0 ? formatMoney(price, currency) : '—'}
                      </span>
                      {hasChoices ? <span className="text-[10px] text-espresso-400">options</span> : null}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- Cart */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Order ({cart.reduce((n, l) => n + l.quantity, 0)})
            </CardTitle>
            {cart.length > 0 ? (
              <button type="button" onClick={() => setCart([])} className="text-xs text-espresso-400 hover:text-chilli-600">
                Clear
              </button>
            ) : null}
          </CardHeader>

          <CardBody className="space-y-3">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-espresso-400">Tap items on the left to add them.</p>
            ) : (
              <ul className="max-h-[40vh] space-y-2 overflow-y-auto scroll-slim">
                {cart.map((line) => (
                  <li key={line.key} className="rounded-lg border border-espresso-100 bg-cream-50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-espresso-900">
                          {line.itemName}
                          {line.variantName ? <span className="text-espresso-500"> · {line.variantName}</span> : null}
                        </p>
                        {line.addOns.length > 0 ? (
                          <p className="mt-0.5 text-xs text-espresso-400">
                            {line.addOns.map((a) => a.name).join(', ')}
                          </p>
                        ) : null}
                        {line.note ? <p className="mt-0.5 text-xs italic text-saffron-700">“{line.note}”</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCart((prev) => prev.filter((l) => l.key !== line.key))}
                        className="rounded p-1 text-espresso-300 hover:text-chilli-600"
                        aria-label={`Remove ${line.itemName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-espresso-200 bg-white text-espresso-600 hover:bg-cream-100"
                          aria-label="Decrease"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-espresso-200 bg-white text-espresso-600 hover:bg-cream-100"
                          aria-label="Increase"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-espresso-900">
                        {formatMoney((line.unitPrice + line.addOns.reduce((a, o) => a + o.price, 0)) * line.quantity, currency)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Field label="Note for the kitchen" hint="Less spicy, no onion, extra sauce…">
              <Textarea rows={2} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} maxLength={1000} />
            </Field>

            {cart.length > 0 ? (
              <dl className="space-y-1 border-t border-espresso-100 pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-espresso-500">Subtotal</dt>
                  <dd className="tabular-nums text-espresso-700">{formatMoney(totals.subtotal, currency)}</dd>
                </div>
                {serviceChargePercent > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-espresso-500">Service {serviceChargePercent}%</dt>
                    <dd className="tabular-nums text-espresso-700">{formatMoney(totals.serviceCharge, currency)}</dd>
                  </div>
                ) : null}
                {taxPercent > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-espresso-500">
                      {taxLabel} {taxPercent}%
                    </dt>
                    <dd className="tabular-nums text-espresso-700">{formatMoney(totals.tax, currency)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-espresso-100 pt-1.5">
                  <dt className="font-semibold text-espresso-900">Total</dt>
                  <dd className="font-semibold tabular-nums text-espresso-900">{formatMoney(totals.total, currency)}</dd>
                </div>
                <p className="pt-1 text-[11px] text-espresso-400">
                  Final prices are confirmed by the server when the order is sent.
                </p>
              </dl>
            ) : null}

            <div className="space-y-2 pt-1">
              <Button size="lg" className="w-full" onClick={() => void submit(true)} disabled={pending || cart.length === 0}>
                {pending ? <Spinner /> : <Send className="h-4 w-4" />}
                Send to kitchen
              </Button>
              <Button variant="outline" className="w-full" onClick={() => void submit(false)} disabled={pending || cart.length === 0}>
                Save as draft
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {configuring ? (
        <ItemOptions
          item={configuring}
          currency={currency}
          onClose={() => setConfiguring(null)}
          onAdd={(variantId, addOns, note) => {
            addToCart(configuring, variantId, addOns, note);
            setConfiguring(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemOptions({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  currency: CurrencyConfig;
  onClose: () => void;
  onAdd: (variantId: string | null, addOns: AddOn[], note: string) => void;
}) {
  const [variantId, setVariantId] = useState(
    item.variants.find((v) => v.isDefault)?.id ?? item.variants[0]?.id ?? '',
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const { group } of item.addOnGroups) {
      initial[group.id] = group.addOns.filter((a) => a.isDefault).map((a) => a.id);
    }
    return initial;
  });
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggle(group: AddOnGroup, addOnId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selectionType === 'SINGLE') {
        return { ...prev, [group.id]: current.includes(addOnId) ? [] : [addOnId] };
      }
      if (current.includes(addOnId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== addOnId) };
      }
      if (group.maxSelect && current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, addOnId] };
    });
  }

  function confirm() {
    for (const { group } of item.addOnGroups) {
      const chosen = selected[group.id] ?? [];
      if (group.isRequired && chosen.length < Math.max(1, group.minSelect)) {
        setError(`Choose at least ${Math.max(1, group.minSelect)} from “${group.name}”.`);
        return;
      }
    }
    const addOns = item.addOnGroups.flatMap(({ group }) =>
      group.addOns.filter((a) => (selected[group.id] ?? []).includes(a.id)),
    );
    onAdd(variantId || null, addOns, note.trim());
  }

  const chosenVariant = item.variants.find((v) => v.id === variantId);
  const addOnTotal = item.addOnGroups
    .flatMap(({ group }) => group.addOns.filter((a) => (selected[group.id] ?? []).includes(a.id)))
    .reduce((sum, a) => sum + a.price, 0);
  const linePrice = (chosenVariant?.price ?? Number(item.basePrice ?? 0)) + addOnTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-md overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>{item.name}</CardTitle>
          <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          {item.variants.length > 1 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-espresso-800">Size</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {item.variants.map((variant) => (
                  <label
                    key={variant.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                      variantId === variant.id
                        ? 'border-saffron-400 bg-saffron-50'
                        : 'border-espresso-200 hover:bg-cream-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="variant"
                        className="h-3.5 w-3.5"
                        checked={variantId === variant.id}
                        onChange={() => setVariantId(variant.id)}
                      />
                      {variant.name}
                    </span>
                    <span className="font-medium tabular-nums">{formatMoney(variant.price, currency)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {item.addOnGroups.map(({ group }) => (
            <fieldset key={group.id}>
              <legend className="mb-2 text-sm font-medium text-espresso-800">
                {group.name}
                <span className="ml-2 text-xs font-normal text-espresso-400">
                  {group.selectionType === 'SINGLE' ? 'choose one' : 'choose any'}
                  {group.isRequired ? ' · required' : ''}
                </span>
              </legend>
              <div className="space-y-1.5">
                {group.addOns.map((addOn) => {
                  const isChosen = (selected[group.id] ?? []).includes(addOn.id);
                  return (
                    <label
                      key={addOn.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                        isChosen ? 'border-saffron-400 bg-saffron-50' : 'border-espresso-200 hover:bg-cream-50',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox checked={isChosen} onChange={() => toggle(group, addOn.id)} />
                        {addOn.name}
                      </span>
                      <span className="tabular-nums text-espresso-600">
                        {addOn.price > 0 ? `+${formatMoney(addOn.price, currency)}` : 'free'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <Field label="Note for this item" hint="Less spicy, no onion…">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>

          <div className="flex items-center justify-between gap-3 border-t border-espresso-100 pt-3">
            <span className="text-lg font-semibold tabular-nums text-espresso-900">
              {formatMoney(linePrice, currency)}
            </span>
            <Button onClick={confirm}>
              <Plus className="h-4 w-4" />
              Add to order
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
