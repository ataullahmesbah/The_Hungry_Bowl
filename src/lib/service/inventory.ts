import 'server-only';
import { Prisma, type MovementType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec, round } from '@/lib/money';
import { HttpError } from '@/lib/auth/guard';

export interface MovementInput {
  type: MovementType;
  itemId: string;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  /** Always positive; direction comes from the from/to warehouses. */
  quantity: Prisma.Decimal | number | string;
  unitCost?: Prisma.Decimal | number | string | null;
  reason?: string | null;
  note?: string | null;
  purchaseId?: string | null;
  orderId?: string | null;
  referenceNo?: string | null;
  performedById?: string | null;
  /** Allow a balance to go negative. Off by default. */
  allowNegative?: boolean;
}

/**
 * Apply one stock movement.
 *
 * The movement table is the ledger and StockBalance is a cache of it, so every
 * change goes through here — nothing writes a balance directly. Direction is
 * expressed by the warehouses: `from` decrements, `to` increments, and a
 * transfer does both, which is what makes a warehouse-to-kitchen move a single
 * atomic row rather than two that could drift apart.
 *
 * Must be called inside a transaction.
 */
export async function applyMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const quantity = round(dec(input.quantity), 3);

  if (quantity.lessThanOrEqualTo(0)) {
    throw new HttpError(422, 'Quantity must be greater than zero.', 'invalid_quantity');
  }
  if (!input.fromWarehouseId && !input.toWarehouseId) {
    throw new HttpError(422, 'A stock movement needs a source or a destination.', 'invalid_movement');
  }
  if (input.fromWarehouseId && input.fromWarehouseId === input.toWarehouseId) {
    throw new HttpError(422, 'Source and destination cannot be the same place.', 'invalid_movement');
  }

  const item = await tx.inventoryItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, name: true, deletedAt: true, isActive: true, unit: { select: { code: true } } },
  });
  if (!item || item.deletedAt) throw new HttpError(404, 'Inventory item not found', 'not_found');

  if (input.fromWarehouseId) {
    const balance = await tx.stockBalance.findUnique({
      where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.fromWarehouseId } },
      select: { quantity: true, warehouse: { select: { name: true } } },
    });
    const available = dec(balance?.quantity ?? 0);

    if (!input.allowNegative && available.lessThan(quantity)) {
      const where = balance?.warehouse.name ?? 'that location';
      throw new HttpError(
        409,
        `Only ${available.toString()} ${item.unit.code} of ${item.name} is left in ${where}. You are trying to move ${quantity.toString()}.`,
        'insufficient_stock',
        { available: available.toString(), requested: quantity.toString() },
      );
    }

    await tx.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.fromWarehouseId } },
      create: { itemId: input.itemId, warehouseId: input.fromWarehouseId, quantity: quantity.negated() },
      update: { quantity: { decrement: quantity } },
    });
  }

  if (input.toWarehouseId) {
    await tx.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.toWarehouseId } },
      create: { itemId: input.itemId, warehouseId: input.toWarehouseId, quantity },
      update: { quantity: { increment: quantity } },
    });
  }

  const unitCost = input.unitCost != null ? round(dec(input.unitCost), 4) : null;

  return tx.stockMovement.create({
    data: {
      type: input.type,
      itemId: input.itemId,
      fromWarehouseId: input.fromWarehouseId ?? null,
      toWarehouseId: input.toWarehouseId ?? null,
      quantity,
      unitCost,
      totalCost: unitCost ? round(unitCost.times(quantity)) : null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      purchaseId: input.purchaseId ?? null,
      orderId: input.orderId ?? null,
      referenceNo: input.referenceNo ?? null,
      performedById: input.performedById ?? null,
    },
  });
}

/**
 * Moving-average cost, recalculated on receipt.
 *
 * Weighting the new delivery against the stock already on hand is what makes
 * food-cost reporting reflect what was actually paid over time rather than
 * whatever the last invoice happened to say.
 *
 * MUST be called BEFORE the receipt movement is applied. It reads the current
 * balance as "what we already had", so running it afterwards would count the
 * incoming quantity on both sides of the average and halve the result.
 */
export async function updateAverageCost(
  tx: Prisma.TransactionClient,
  itemId: string,
  receivedQty: Prisma.Decimal | number,
  receivedUnitCost: Prisma.Decimal | number,
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: itemId },
    select: { avgUnitCost: true, balances: { select: { quantity: true } } },
  });
  if (!item) return;

  const existingQty = item.balances.reduce((sum, b) => sum.plus(dec(b.quantity)), dec(0));
  const incomingQty = dec(receivedQty);
  const incomingCost = dec(receivedUnitCost);
  const totalQty = existingQty.plus(incomingQty);

  const nextAverage = totalQty.greaterThan(0)
    ? existingQty.times(dec(item.avgUnitCost)).plus(incomingQty.times(incomingCost)).dividedBy(totalQty)
    : incomingCost;

  await tx.inventoryItem.update({
    where: { id: itemId },
    data: {
      avgUnitCost: round(nextAverage, 4),
      lastPurchasePrice: round(incomingCost, 4),
    },
  });
}

/** Items at or below their reorder level, with where the stock is. */
export async function lowStockItems() {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true, deletedAt: null, reorderLevel: { gt: 0 } },
    select: {
      id: true,
      name: true,
      reorderLevel: true,
      criticalLevel: true,
      unit: { select: { code: true } },
      category: { select: { name: true } },
      balances: { select: { quantity: true, warehouse: { select: { id: true, name: true } } } },
    },
  });

  return items
    .map((item) => {
      const total = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
      return {
        id: item.id,
        name: item.name,
        unit: item.unit.code,
        category: item.category?.name ?? null,
        total: Number(total.toFixed(3)),
        reorderLevel: Number(item.reorderLevel),
        criticalLevel: Number(item.criticalLevel),
        isCritical: Number(item.criticalLevel) > 0 && total <= Number(item.criticalLevel),
        balances: item.balances.map((b) => ({
          warehouseId: b.warehouse.id,
          warehouse: b.warehouse.name,
          quantity: Number(b.quantity),
        })),
      };
    })
    .filter((item) => item.total <= item.reorderLevel)
    .sort((a, b) => a.total / (a.reorderLevel || 1) - b.total / (b.reorderLevel || 1));
}

export async function nextPurchaseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { key: 'purchase' },
    create: { key: 'purchase', value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return `PO-${String(counter.value).padStart(5, '0')}`;
}

export async function defaultWarehouses() {
  const [receiving, consumption] = await Promise.all([
    prisma.warehouse.findFirst({ where: { isDefaultReceiving: true, isActive: true } }),
    prisma.warehouse.findFirst({ where: { isDefaultConsumption: true, isActive: true } }),
  ]);
  return { receiving, consumption };
}
