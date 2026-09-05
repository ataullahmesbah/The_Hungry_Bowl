import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { shortCode } from '@/lib/security/hash';
import { computeBill, dec, lineTotal, round } from '@/lib/money';
import { HttpError } from '@/lib/auth/guard';
import type { getSettings } from '@/lib/settings';

type Settings = Awaited<ReturnType<typeof getSettings>>;

/**
 * Mint the next human-facing order number.
 *
 * The counter row is incremented atomically, so two waiters submitting at the
 * same moment can never be handed the same number. The counter key carries the
 * business date when daily reset is on, which is how "#1" starts again each
 * morning without a scheduled job.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  settings: Settings,
): Promise<string> {
  const key = settings.orderNumberDailyReset
    ? `order:${businessDateKey(settings.timezone)}`
    : 'order:all';

  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });

  const padded = String(counter.value).padStart(settings.orderNumberDailyReset ? 3 : 5, '0');
  const prefix = settings.orderNumberPrefix?.trim() ?? '';

  return settings.orderNumberDailyReset
    ? `${prefix}${businessDateKey(settings.timezone).replace(/-/g, '').slice(2)}-${padded}`
    : `${prefix}${padded}`;
}

/** YYYY-MM-DD in the restaurant's own timezone, not the server's. */
export function businessDateKey(timezone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Short code shown beside the order number, PRD §8.
 *
 * It is for humans matching a paper ticket to a screen, so it only needs to be
 * unique among orders still in service — not forever, and never as a key.
 */
export async function uniqueOrderSecretCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const code = shortCode(4);
    const clash = await tx.order.findFirst({
      where: { secretCode: code, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return shortCode(6);
}

export interface OrderLineInput {
  menuItemId: string;
  variantId?: string | null;
  quantity: number;
  addOnIds?: string[];
  note?: string | null;
}

export interface PricedLine {
  menuItemId: string;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  addOnTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  note: string | null;
  options: {
    addOnId: string;
    groupName: string;
    addOnName: string;
    price: Prisma.Decimal;
  }[];
}

/**
 * Turn client-supplied item ids into priced lines.
 *
 * The browser only ever sends ids, quantities and notes. Every price is read
 * from the database here, so a tampered request cannot discount its own bill.
 * Unavailable items and sizes are rejected rather than silently priced.
 */
export async function priceLines(
  tx: Prisma.TransactionClient,
  lines: OrderLineInput[],
): Promise<PricedLine[]> {
  if (lines.length === 0) throw new HttpError(422, 'Add at least one item to the order', 'empty_order');

  const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter(Boolean))] as string[];
  const addOnIds = [...new Set(lines.flatMap((l) => l.addOnIds ?? []))];

  const [items, variants, addOns] = await Promise.all([
    tx.menuItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, isAvailable: true, deletedAt: true, status: true, basePrice: true },
    }),
    variantIds.length
      ? tx.menuVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, name: true, price: true, isAvailable: true, menuItemId: true },
        })
      : Promise.resolve([]),
    addOnIds.length
      ? tx.addOn.findMany({
          where: { id: { in: addOnIds } },
          select: { id: true, name: true, price: true, isAvailable: true, group: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const addOnMap = new Map(addOns.map((a) => [a.id, a]));

  return lines.map((line) => {
    const item = itemMap.get(line.menuItemId);
    if (!item || item.deletedAt || item.status === 'ARCHIVED') {
      throw new HttpError(422, 'One of the items is no longer on the menu.', 'item_unavailable');
    }
    if (!item.isAvailable) {
      throw new HttpError(409, `“${item.name}” is switched off right now and cannot be ordered.`, 'item_unavailable');
    }

    let variant = null as (typeof variants)[number] | null;
    if (line.variantId) {
      variant = variantMap.get(line.variantId) ?? null;
      if (!variant || variant.menuItemId !== item.id) {
        throw new HttpError(422, `That size does not belong to “${item.name}”.`, 'invalid_variant');
      }
      if (!variant.isAvailable) {
        throw new HttpError(409, `“${item.name} — ${variant.name}” is not available right now.`, 'variant_unavailable');
      }
    }

    const unitPrice = variant ? dec(variant.price) : dec(item.basePrice ?? 0);

    const options = (line.addOnIds ?? []).map((addOnId) => {
      const addOn = addOnMap.get(addOnId);
      if (!addOn) throw new HttpError(422, 'One of the selected extras no longer exists.', 'invalid_addon');
      if (!addOn.isAvailable) {
        throw new HttpError(409, `“${addOn.name}” is not available right now.`, 'addon_unavailable');
      }
      return {
        addOnId: addOn.id,
        groupName: addOn.group.name,
        addOnName: addOn.name,
        price: dec(addOn.price),
      };
    });

    const addOnTotal = options.reduce((sum, option) => sum.plus(option.price), dec(0));

    return {
      menuItemId: item.id,
      variantId: variant?.id ?? null,
      // Names are snapshotted so a later menu rename never rewrites a receipt.
      itemName: item.name,
      variantName: variant?.name ?? null,
      unitPrice: round(unitPrice),
      quantity: line.quantity,
      addOnTotal: round(addOnTotal),
      lineTotal: lineTotal({ unitPrice, quantity: line.quantity, addOnTotal }),
      note: line.note?.trim() || null,
      options,
    };
  });
}

/** Recompute and persist an order's money after its lines change. */
export async function recalculateOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      discountAmount: true,
      taxPercent: true,
      serviceChargePercent: true,
      items: { select: { unitPrice: true, quantity: true, addOnTotal: true, cancelledQty: true } },
      payments: { where: { status: 'COMPLETED' }, select: { amount: true, refundedAmount: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', 'not_found');

  const bill = computeBill({
    lines: order.items.map((item) => ({
      unitPrice: item.unitPrice,
      quantity: Math.max(0, item.quantity - item.cancelledQty),
      addOnTotal: item.addOnTotal,
    })),
    discountAmount: order.discountAmount,
    taxPercent: order.taxPercent,
    serviceChargePercent: order.serviceChargePercent,
  });

  const paid = order.payments.reduce(
    (sum, payment) => sum.plus(dec(payment.amount)).minus(dec(payment.refundedAmount)),
    dec(0),
  );

  const due = round(bill.totalAmount.minus(paid));
  const paymentState = paid.lessThanOrEqualTo(0)
    ? 'UNPAID'
    : paid.greaterThanOrEqualTo(bill.totalAmount)
      ? 'PAID'
      : 'PARTIALLY_PAID';

  return tx.order.update({
    where: { id: orderId },
    data: {
      subtotal: bill.subtotal,
      discountAmount: bill.discountAmount,
      serviceChargeAmount: bill.serviceChargeAmount,
      taxAmount: bill.taxAmount,
      roundingAmount: bill.roundingAmount,
      totalAmount: bill.totalAmount,
      paidAmount: round(paid),
      dueAmount: due.lessThan(0) ? dec(0) : due,
      paymentState,
    },
  });
}

/** Legal moves through the order lifecycle. */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new HttpError(
      409,
      `An order that is ${from.toLowerCase()} cannot be moved to ${to.toLowerCase()}.`,
      'invalid_transition',
    );
  }
}

export function optionsText(options: { addOnName: string }[], note: string | null): string | null {
  const parts: string[] = [];
  if (options.length) parts.push(options.map((o) => o.addOnName).join(', '));
  if (note) parts.push(`Note: ${note}`);
  return parts.length ? parts.join(' · ') : null;
}
