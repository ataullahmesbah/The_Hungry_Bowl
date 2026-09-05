'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney, type CurrencyConfig } from '@/lib/format';

interface Line {
  itemId: string;
  quantity: string;
  unitCost: string;
  note: string;
}

export function PurchaseForm({
  items,
  suppliers,
  warehouses,
  currency,
}: {
  items: { id: string; name: string; unit: string; lastPrice: number }[];
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string; isDefaultReceiving: boolean }[];
  currency: CurrencyConfig;
}) {
  const router = useRouter();
  const toast = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState(
    warehouses.find((w) => w.isDefaultReceiving)?.id ?? warehouses[0]?.id ?? '',
  );
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [shippingCost, setShippingCost] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [receiveNow, setReceiveNow] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ itemId: '', quantity: '', unitCost: '', note: '' }]);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);
    const total = subtotal + (Number(taxAmount) || 0) + (Number(shippingCost) || 0) - (Number(discountAmount) || 0);
    return { subtotal, total, due: Math.max(0, total - (Number(paidAmount) || 0)) };
  }, [lines, taxAmount, shippingCost, discountAmount, paidAmount]);

  function setLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    const usable = lines.filter((line) => line.itemId && Number(line.quantity) > 0);
    if (usable.length === 0) {
      setMessage('Add at least one item with a quantity.');
      setPending(false);
      return;
    }

    try {
      const created = await api.post<{ id: string; purchaseNo: string }>('/api/purchases', {
        supplierId: supplierId || null,
        warehouseId,
        invoiceNo: invoiceNo.trim() || null,
        note: note.trim() || null,
        taxAmount: Number(taxAmount) || 0,
        shippingCost: Number(shippingCost) || 0,
        discountAmount: Number(discountAmount) || 0,
        paidAmount: Number(paidAmount) || 0,
        receiveNow,
        items: usable.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost) || 0,
          note: line.note.trim() || null,
        })),
      });
      toast.success(`Purchase ${created.purchaseNo} saved`, receiveNow ? 'Stock has been received.' : 'Recorded as an order.');
      router.push('/dashboard/purchases');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the purchase.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Supplier" error={errors.supplierId}>
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">No supplier recorded</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Receive into" required error={errors.warehouseId}>
                <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Invoice number" error={errors.invoiceNo}>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={80} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, { itemId: '', quantity: '', unitCost: '', note: '' }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {lines.map((line, index) => {
                const item = items.find((i) => i.id === line.itemId);
                const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                return (
                  <li key={index} className="rounded-lg border border-espresso-100 bg-cream-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_110px_120px_auto] sm:items-end">
                      <Field label={index === 0 ? 'Item' : undefined}>
                        <Select
                          value={line.itemId}
                          onChange={(e) => {
                            const picked = items.find((i) => i.id === e.target.value);
                            setLine(index, {
                              itemId: e.target.value,
                              unitCost: line.unitCost || (picked?.lastPrice ? String(picked.lastPrice) : ''),
                            });
                          }}
                          aria-label={`Item for line ${index + 1}`}
                        >
                          <option value="">Choose an item</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.unit})
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field label={index === 0 ? `Quantity` : undefined}>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) => setLine(index, { quantity: e.target.value })}
                          placeholder={item?.unit ?? '0'}
                          aria-label={`Quantity for line ${index + 1}`}
                        />
                      </Field>

                      <Field label={index === 0 ? 'Cost per unit' : undefined}>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) => setLine(index, { unitCost: e.target.value })}
                          aria-label={`Unit cost for line ${index + 1}`}
                        />
                      </Field>

                      <div className="flex items-center gap-2 pb-1">
                        <span className="min-w-20 text-right text-sm font-medium tabular-nums text-espresso-900">
                          {formatMoney(lineTotal, currency)}
                        </span>
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                            className="rounded p-1.5 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {item ? (
                      <p className="mt-1.5 text-xs text-espresso-400">
                        Last paid {formatMoney(item.lastPrice, currency)} per {item.unit}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Note</CardTitle>
          </CardHeader>
          <CardBody>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Anything worth remembering about this delivery." />
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Cost</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-espresso-500">Items</dt>
                <dd className="tabular-nums text-espresso-700">{formatMoney(totals.subtotal, currency)}</dd>
              </div>
            </dl>

            <div className="grid gap-3">
              <Field label="Tax">
                <Input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
              </Field>
              <Field label="Delivery / transport">
                <Input type="number" min="0" step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
              </Field>
              <Field label="Discount">
                <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
              </Field>
            </div>

            <div className="flex justify-between border-t border-espresso-100 pt-3 text-sm">
              <span className="font-semibold text-espresso-900">Total</span>
              <span className="font-semibold tabular-nums text-espresso-900">{formatMoney(totals.total, currency)}</span>
            </div>

            <Field label="Paid now" hint="Anything unpaid is added to the supplier's balance.">
              <Input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </Field>

            {totals.due > 0 ? (
              <p className="rounded bg-chilli-500/10 px-3 py-2 text-sm font-medium text-chilli-600">
                Owing {formatMoney(totals.due, currency)}
              </p>
            ) : null}

            <label className="flex items-start gap-2.5 rounded-lg border border-espresso-100 p-3 text-sm">
              <Checkbox className="mt-0.5" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} />
              <span>
                <span className="block font-medium text-espresso-800">The stock has arrived</span>
                <span className="block text-xs text-espresso-400">
                  Moves it into the store now and updates the average cost. Leave off to record an order you are still
                  waiting for.
                </span>
              </span>
            </label>

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? <Spinner /> : <Package className="h-4 w-4" />}
              {receiveNow ? 'Save and receive' : 'Save as an order'}
            </Button>
          </CardBody>
        </Card>
      </aside>
    </form>
  );
}
