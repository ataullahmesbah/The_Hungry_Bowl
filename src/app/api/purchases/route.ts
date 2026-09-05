import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { purchaseSchema } from '@/lib/validation/inventory';
import { applyMovement, nextPurchaseNumber, updateAverageCost } from '@/lib/service/inventory';
import { dec, round } from '@/lib/money';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  status: z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED']).optional(),
  supplierId: z.string().cuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.PURCHASE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.PurchaseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.from || query.to
        ? {
            purchaseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total, sum] = await Promise.all([
      prisma.purchase.findMany({
        where,
        orderBy: { purchaseDate: 'desc' },
        ...paginate(query),
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.purchase.count({ where }),
      prisma.purchase.aggregate({ where, _sum: { totalAmount: true, dueAmount: true } }),
    ]);

    return apiSuccess({
      items,
      meta: pageMeta(total, query),
      totals: {
        total: Number(sum._sum.totalAmount ?? 0),
        due: Number(sum._sum.dueAmount ?? 0),
      },
    });
  },
);

/**
 * Record a purchase, optionally receiving it into stock in the same step.
 *
 * Receiving is what actually moves stock: it writes a PURCHASE_RECEIVE
 * movement per line and rolls the moving-average cost forward, so food-cost
 * reporting reflects what was really paid rather than the latest invoice.
 */
export const POST = route(
  { permission: PERMISSIONS.PURCHASE_MANAGE, bodySchema: purchaseSchema },
  async ({ body, session }) => {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new HttpError(404, 'Warehouse not found', 'not_found');

    const purchase = await prisma.$transaction(async (tx) => {
      const subtotal = body.items.reduce((sum, line) => sum.plus(dec(line.quantity).times(dec(line.unitCost))), dec(0));
      const totalAmount = round(
        subtotal.plus(dec(body.taxAmount)).plus(dec(body.shippingCost)).minus(dec(body.discountAmount)),
      );
      const paidAmount = round(dec(body.paidAmount));
      const dueAmount = round(totalAmount.minus(paidAmount));

      const created = await tx.purchase.create({
        data: {
          purchaseNo: await nextPurchaseNumber(tx),
          supplierId: body.supplierId ?? null,
          warehouseId: body.warehouseId,
          status: body.receiveNow ? 'RECEIVED' : 'ORDERED',
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
          receivedAt: body.receiveNow ? new Date() : null,
          invoiceNo: body.invoiceNo?.trim() || null,
          note: body.note?.trim() || null,
          subtotal: round(subtotal),
          taxAmount: round(dec(body.taxAmount)),
          shippingCost: round(dec(body.shippingCost)),
          discountAmount: round(dec(body.discountAmount)),
          totalAmount,
          paidAmount,
          dueAmount: dueAmount.lessThan(0) ? dec(0) : dueAmount,
          createdById: session!.user.id,
          receivedById: body.receiveNow ? session!.user.id : null,
        },
      });

      for (const line of body.items) {
        const item = await tx.inventoryItem.findUnique({
          where: { id: line.itemId },
          select: { id: true, name: true, deletedAt: true },
        });
        if (!item || item.deletedAt) {
          throw new HttpError(422, 'One of the items is no longer in the inventory list.', 'item_missing');
        }

        await tx.purchaseItem.create({
          data: {
            purchaseId: created.id,
            itemId: line.itemId,
            itemName: item.name,
            quantity: round(dec(line.quantity), 3),
            receivedQuantity: body.receiveNow ? round(dec(line.quantity), 3) : dec(0),
            unitCost: round(dec(line.unitCost), 4),
            lineTotal: round(dec(line.quantity).times(dec(line.unitCost))),
            note: line.note ?? null,
          },
        });

        if (body.receiveNow) {
          // Average first: it weights the delivery against the stock already
          // on hand, so it has to run before this delivery lands in the balance.
          await updateAverageCost(tx, line.itemId, line.quantity, line.unitCost);
          await applyMovement(tx, {
            type: 'PURCHASE_RECEIVE',
            itemId: line.itemId,
            toWarehouseId: body.warehouseId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            purchaseId: created.id,
            referenceNo: created.purchaseNo,
            performedById: session!.user.id,
          });
        }
      }

      if (body.supplierId && dueAmount.greaterThan(0)) {
        await tx.supplier.update({
          where: { id: body.supplierId },
          data: { outstandingBalance: { increment: dueAmount } },
        });
      }

      return tx.purchase.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: true, supplier: { select: { name: true } }, warehouse: { select: { name: true } } },
      });
    });

    await audit({
      session,
      action: body.receiveNow ? 'purchasing.received' : 'purchasing.ordered',
      entity: 'Purchase',
      entityId: purchase.id,
      severity: 'MEDIUM',
      after: {
        purchaseNo: purchase.purchaseNo,
        total: Number(purchase.totalAmount),
        supplier: purchase.supplier?.name,
        lines: purchase.items.length,
      },
    });

    return apiSuccess(purchase, { status: 201 });
  },
);
