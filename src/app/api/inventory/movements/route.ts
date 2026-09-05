import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import {
  adjustmentSchema,
  consumptionSchema,
  openingStockSchema,
  returnSchema,
  transferSchema,
  wastageSchema,
} from '@/lib/validation/inventory';
import { applyMovement, updateAverageCost } from '@/lib/service/inventory';
import { dec, round } from '@/lib/money';
import { publishEvent } from '@/lib/realtime/publish';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  itemId: z.string().cuid().optional(),
  warehouseId: z.string().cuid().optional(),
  type: z.string().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.INVENTORY_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const types = query.type?.split(',').filter(Boolean);

    const where: Prisma.StockMovementWhereInput = {
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.warehouseId
        ? { OR: [{ fromWarehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }
        : {}),
      ...(types?.length ? { type: { in: types as never } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: {
          item: { select: { id: true, name: true, unit: { select: { code: true } } } },
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

/**
 * One endpoint for every kind of hand-entered stock movement.
 *
 * They all funnel into applyMovement so the ledger and the balance can never
 * disagree — the only difference between a transfer, a wastage and a return is
 * which warehouses are named and what gets audited.
 */
const bodySchema = z.discriminatedUnion('kind', [
  transferSchema.extend({ kind: z.literal('TRANSFER') }),
  consumptionSchema.extend({ kind: z.literal('CONSUMPTION') }),
  wastageSchema.extend({ kind: z.literal('WASTAGE') }),
  returnSchema.extend({ kind: z.literal('RETURN') }),
  adjustmentSchema.extend({ kind: z.literal('ADJUSTMENT') }),
  openingStockSchema.extend({ kind: z.literal('OPENING') }),
]);

const PERMISSION_FOR: Record<string, string> = {
  TRANSFER: PERMISSIONS.INVENTORY_TRANSFER,
  CONSUMPTION: PERMISSIONS.INVENTORY_TRANSFER,
  WASTAGE: PERMISSIONS.INVENTORY_WASTAGE,
  RETURN: PERMISSIONS.INVENTORY_WASTAGE,
  ADJUSTMENT: PERMISSIONS.INVENTORY_ADJUST,
  OPENING: PERMISSIONS.INVENTORY_MANAGE,
};

export const POST = route(
  { permission: PERMISSIONS.INVENTORY_VIEW, bodySchema },
  async ({ body, session }) => {
    const required = PERMISSION_FOR[body.kind]!;
    if (!session!.user.permissions.has(required)) {
      throw new HttpError(403, 'You do not have permission to record this kind of stock movement.', 'forbidden');
    }

    const performedById = session!.user.id;

    const result = await prisma.$transaction(async (tx) => {
      switch (body.kind) {
        case 'TRANSFER':
          return applyMovement(tx, {
            type: 'TRANSFER',
            itemId: body.itemId,
            fromWarehouseId: body.fromWarehouseId,
            toWarehouseId: body.toWarehouseId,
            quantity: body.quantity,
            note: body.note ?? null,
            performedById,
          });

        case 'CONSUMPTION':
          return applyMovement(tx, {
            type: 'CONSUMPTION',
            itemId: body.itemId,
            fromWarehouseId: body.warehouseId,
            quantity: body.quantity,
            reason: body.reason ?? 'Manual consumption',
            note: body.note ?? null,
            performedById,
          });

        case 'WASTAGE':
          return applyMovement(tx, {
            type: 'WASTAGE',
            itemId: body.itemId,
            fromWarehouseId: body.warehouseId,
            quantity: body.quantity,
            reason: body.reason,
            note: body.note ?? null,
            performedById,
          });

        case 'RETURN':
          return applyMovement(tx, {
            type: 'RETURN',
            itemId: body.itemId,
            fromWarehouseId: body.fromWarehouseId,
            toWarehouseId: body.toWarehouseId,
            quantity: body.quantity,
            reason: body.reason ?? 'Returned to store',
            performedById,
          });

        case 'ADJUSTMENT': {
          // The operator enters what they counted; the system works out the
          // difference, so a stocktake never needs mental arithmetic.
          const balance = await tx.stockBalance.findUnique({
            where: { itemId_warehouseId: { itemId: body.itemId, warehouseId: body.warehouseId } },
            select: { quantity: true },
          });
          const current = dec(balance?.quantity ?? 0);
          const counted = dec(body.countedQuantity);
          const difference = round(counted.minus(current), 3);

          if (difference.isZero()) {
            throw new HttpError(422, 'The counted quantity already matches the system. Nothing to adjust.', 'no_change');
          }

          return applyMovement(tx, {
            type: 'ADJUSTMENT',
            itemId: body.itemId,
            ...(difference.greaterThan(0)
              ? { toWarehouseId: body.warehouseId }
              : { fromWarehouseId: body.warehouseId }),
            quantity: difference.abs(),
            reason: body.reason,
            note: `Counted ${counted.toString()}, system had ${current.toString()}${body.note ? ` — ${body.note}` : ''}`,
            performedById,
            allowNegative: true,
          });
        }

        case 'OPENING': {
          // Average before the movement — see updateAverageCost.
          if (body.unitCost != null) {
            await updateAverageCost(tx, body.itemId, body.quantity, body.unitCost);
          }
          return applyMovement(tx, {
            type: 'OPENING',
            itemId: body.itemId,
            toWarehouseId: body.warehouseId,
            quantity: body.quantity,
            unitCost: body.unitCost ?? null,
            reason: 'Opening stock',
            note: body.note ?? null,
            performedById,
          });
        }
      }
    });

    const item = await prisma.inventoryItem.findUnique({
      where: { id: body.itemId },
      select: {
        name: true,
        reorderLevel: true,
        criticalLevel: true,
        unit: { select: { code: true } },
        balances: { select: { quantity: true } },
      },
    });

    if (item) {
      const total = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
      const critical = Number(item.criticalLevel) > 0 && total <= Number(item.criticalLevel);
      const low = Number(item.reorderLevel) > 0 && total <= Number(item.reorderLevel);

      if (low) {
        await publishEvent({
          channel: 'inventory',
          type: critical ? 'stock.critical' : 'stock.low',
          payload: { itemId: body.itemId, name: item.name, total, unit: item.unit.code },
          requiredPermission: PERMISSIONS.INVENTORY_VIEW,
        });

        await notify({
          type: critical ? 'stock.critical' : 'stock.low',
          title: `${critical ? 'Critical' : 'Low'} stock: ${item.name}`,
          body: `${total} ${item.unit.code} left — reorder level is ${Number(item.reorderLevel)} ${item.unit.code}.`,
          level: critical ? 'CRITICAL' : 'WARNING',
          href: '/dashboard/inventory?filter=low',
          permissions: [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.PURCHASE_MANAGE],
        });
      }
    }

    await audit({
      session,
      action: `inventory.${body.kind.toLowerCase()}`,
      entity: 'StockMovement',
      entityId: result.id,
      severity: body.kind === 'ADJUSTMENT' || body.kind === 'WASTAGE' ? 'HIGH' : 'MEDIUM',
      after: {
        item: item?.name,
        quantity: Number(result.quantity),
        from: result.fromWarehouseId,
        to: result.toWarehouseId,
        reason: result.reason,
      },
    });

    return apiSuccess(result, { status: 201 });
  },
);
