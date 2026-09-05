import 'server-only';
import { Prisma } from '@prisma/client';
import { dec, round } from '@/lib/money';
import { applyMovement } from './inventory';

export interface ConsumptionResult {
  consumed: { itemId: string; itemName: string; quantity: number; unit: string }[];
  skipped: { reason: string; detail: string }[];
  foodCost: number;
}

/**
 * Deduct recipe ingredients when an order completes, PRD §12.
 *
 * Three deliberate choices:
 *
 * 1. Idempotent. The order's stockConsumedAt is set inside the same
 *    transaction, so completing an order twice — a double click, a retry —
 *    can never consume the stock twice.
 * 2. Never blocks the sale. If an ingredient has run out on paper, the
 *    shortfall is recorded and reported rather than refusing to complete an
 *    order for food the customer has already eaten. Stock going negative is
 *    information for the manager, not a reason to break service.
 * 3. Opt-out per recipe. autoConsume=false means the kitchen tracks that
 *    variant by hand, which the PRD requires to be configurable.
 *
 * Must be called inside a transaction.
 */
export async function consumeOrderRecipes(
  tx: Prisma.TransactionClient,
  orderId: string,
  performedById: string | null,
): Promise<ConsumptionResult | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      stockConsumedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          itemName: true,
          variantName: true,
          quantity: true,
          cancelledQty: true,
        },
      },
    },
  });

  if (!order) return null;
  if (order.stockConsumedAt) return null; // already done — see note 1

  const consumptionWarehouse = await tx.warehouse.findFirst({
    where: { isDefaultConsumption: true, isActive: true },
    select: { id: true, name: true },
  });

  if (!consumptionWarehouse) {
    return {
      consumed: [],
      skipped: [{ reason: 'no_kitchen_store', detail: 'No location is marked as the recipe source.' }],
      foodCost: 0,
    };
  }

  const consumed: ConsumptionResult['consumed'] = [];
  const skipped: ConsumptionResult['skipped'] = [];
  let foodCost = dec(0);

  // Roll up identical ingredients across lines so an order with two dishes
  // sharing an ingredient produces one movement, not two.
  const totals = new Map<string, Prisma.Decimal>();

  for (const line of order.items) {
    const servings = line.quantity - line.cancelledQty;
    if (servings <= 0 || !line.variantId) continue;

    const recipe = await tx.recipe.findUnique({
      where: { variantId: line.variantId },
      include: { ingredients: true },
    });

    if (!recipe) {
      skipped.push({
        reason: 'no_recipe',
        detail: `${line.itemName}${line.variantName ? ` (${line.variantName})` : ''} has no recipe.`,
      });
      continue;
    }
    if (!recipe.isActive || !recipe.autoConsume) {
      skipped.push({
        reason: 'auto_consume_off',
        detail: `${line.itemName}${line.variantName ? ` (${line.variantName})` : ''} is tracked by hand.`,
      });
      continue;
    }

    const yieldQty = dec(recipe.yieldQty).greaterThan(0) ? dec(recipe.yieldQty) : dec(1);

    for (const ingredient of recipe.ingredients) {
      if (ingredient.isOptional) continue;
      const needed = dec(ingredient.quantity).times(servings).dividedBy(yieldQty);
      totals.set(ingredient.itemId, (totals.get(ingredient.itemId) ?? dec(0)).plus(needed));
    }
  }

  for (const [itemId, quantity] of totals) {
    const rounded = round(quantity, 3);
    if (rounded.lessThanOrEqualTo(0)) continue;

    const item = await tx.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, avgUnitCost: true, unit: { select: { code: true } } },
    });
    if (!item) continue;

    const balance = await tx.stockBalance.findUnique({
      where: { itemId_warehouseId: { itemId, warehouseId: consumptionWarehouse.id } },
      select: { quantity: true },
    });
    const available = dec(balance?.quantity ?? 0);

    if (available.lessThan(rounded)) {
      skipped.push({
        reason: 'short_stock',
        detail: `${item.name}: needed ${rounded.toString()} ${item.unit.code}, only ${available.toString()} recorded in ${consumptionWarehouse.name}.`,
      });
    }

    await applyMovement(tx, {
      type: 'CONSUMPTION',
      itemId,
      fromWarehouseId: consumptionWarehouse.id,
      quantity: rounded,
      unitCost: item.avgUnitCost,
      reason: `Recipe consumption for order #${order.orderNumber}`,
      orderId: order.id,
      referenceNo: order.orderNumber,
      performedById,
      // See note 2: the food has already left the kitchen.
      allowNegative: true,
    });

    consumed.push({
      itemId,
      itemName: item.name,
      quantity: Number(rounded),
      unit: item.unit.code,
    });
    foodCost = foodCost.plus(rounded.times(dec(item.avgUnitCost)));
  }

  await tx.order.update({ where: { id: orderId }, data: { stockConsumedAt: new Date() } });

  return { consumed, skipped, foodCost: Number(round(foodCost).toString()) };
}
