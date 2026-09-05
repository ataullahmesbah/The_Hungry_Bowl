import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { receivePurchaseSchema } from '@/lib/validation/inventory';
import { applyMovement, updateAverageCost } from '@/lib/service/inventory';
import { dec, round } from '@/lib/money';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Receive an ordered purchase, in full or in part.
 *
 * Only the not-yet-received remainder of each line moves, so calling this
 * twice for the same delivery cannot double the stock.
 */
export const POST = route(
  { permission: PERMISSIONS.PURCHASE_MANAGE, bodySchema: receivePurchaseSchema },
  async ({ body, params, session }) => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: params.id },
      include: { items: true },
    });
    if (!purchase) throw new HttpError(404, 'Purchase not found', 'not_found');
    if (purchase.status === 'CANCELLED') throw new HttpError(409, 'This purchase was cancelled.', 'cancelled');
    if (purchase.status === 'RECEIVED') throw new HttpError(409, 'This purchase is already fully received.', 'already_received');

    const updated = await prisma.$transaction(async (tx) => {
      for (const entry of body.items) {
        const line = purchase.items.find((i) => i.id === entry.purchaseItemId);
        if (!line) throw new HttpError(404, 'One of the lines does not belong to this purchase.', 'not_found');

        const outstanding = dec(line.quantity).minus(dec(line.receivedQuantity));
        const receiving = round(dec(entry.receivedQuantity), 3);

        if (receiving.lessThanOrEqualTo(0)) continue;
        if (receiving.greaterThan(outstanding)) {
          throw new HttpError(
            422,
            `Only ${outstanding.toString()} of ${line.itemName} is still outstanding on this order.`,
            'over_receive',
          );
        }

        await tx.purchaseItem.update({
          where: { id: line.id },
          data: { receivedQuantity: { increment: receiving } },
        });

        // Average before the movement — see updateAverageCost.
        await updateAverageCost(tx, line.itemId, receiving, line.unitCost);

        await applyMovement(tx, {
          type: 'PURCHASE_RECEIVE',
          itemId: line.itemId,
          toWarehouseId: purchase.warehouseId,
          quantity: receiving,
          unitCost: line.unitCost,
          purchaseId: purchase.id,
          referenceNo: purchase.purchaseNo,
          performedById: session!.user.id,
        });
      }

      const refreshed = await tx.purchase.findUniqueOrThrow({
        where: { id: params.id },
        include: { items: true },
      });

      const fullyReceived = refreshed.items.every((i) =>
        dec(i.receivedQuantity).greaterThanOrEqualTo(dec(i.quantity)),
      );
      const anyReceived = refreshed.items.some((i) => dec(i.receivedQuantity).greaterThan(0));

      return tx.purchase.update({
        where: { id: params.id },
        data: {
          status: fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : refreshed.status,
          receivedAt: fullyReceived ? new Date() : refreshed.receivedAt,
          receivedById: session!.user.id,
        },
        include: { items: true },
      });
    });

    await audit({
      session,
      action: 'purchasing.received',
      entity: 'Purchase',
      entityId: params.id,
      severity: 'MEDIUM',
      after: { purchaseNo: purchase.purchaseNo, status: updated.status },
    });

    return apiSuccess(updated);
  },
);
