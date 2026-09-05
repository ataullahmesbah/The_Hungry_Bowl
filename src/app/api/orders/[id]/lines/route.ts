import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { addLinesSchema, cancelLineSchema } from '@/lib/validation/orders';
import { optionsText, priceLines, recalculateOrder } from '@/lib/service/orders';
import { publishEvent } from '@/lib/realtime/publish';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/** Add items to an order that has already been placed — a second round. */
export const POST = route(
  { permission: PERMISSIONS.ORDER_EDIT, bodySchema: addLinesSchema },
  async ({ body, params, session }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, orderNumber: true, secretCode: true, kitchenTicket: { select: { id: true } } },
    });
    if (!order) throw new HttpError(404, 'Order not found', 'not_found');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      throw new HttpError(409, 'This order is closed. Start a new order for this table instead.', 'order_locked');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const priced = await priceLines(tx, body.lines);

      for (const line of priced) {
        const item = await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: line.menuItemId,
            variantId: line.variantId,
            itemName: line.itemName,
            variantName: line.variantName,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            addOnTotal: line.addOnTotal,
            lineTotal: line.lineTotal,
            note: line.note,
            status: 'PLACED',
            options: {
              create: line.options.map((option) => ({
                addOnId: option.addOnId,
                groupName: option.groupName,
                addOnName: option.addOnName,
                price: option.price,
              })),
            },
          },
          include: { options: true },
        });

        if (body.sendToKitchen) {
          const ticketId =
            order.kitchenTicket?.id ??
            (await tx.kitchenTicket.create({ data: { orderId: order.id, status: 'NEW' } })).id;

          await tx.kitchenTicketItem.create({
            data: {
              ticketId,
              orderItemId: item.id,
              itemName: item.itemName,
              variantName: item.variantName,
              quantity: item.quantity,
              optionsText: optionsText(item.options, item.note),
              note: item.note,
            },
          });

          // A new round re-opens a ticket the kitchen had already finished.
          await tx.kitchenTicket.update({
            where: { id: ticketId },
            data: { status: 'NEW', readyAt: null },
          });
        }
      }

      return recalculateOrder(tx, order.id);
    });

    if (body.sendToKitchen) {
      await publishEvent({
        channel: 'kitchen',
        type: 'order.items_added',
        payload: { orderId: order.id, orderNumber: order.orderNumber, secretCode: order.secretCode, added: body.lines.length },
        requiredPermission: PERMISSIONS.KITCHEN_VIEW,
      });
    }

    await audit({ session, action: 'order.items_added', entity: 'Order', entityId: order.id, after: { added: body.lines.length } });
    return apiSuccess(updated, { status: 201 });
  },
);

const cancelBody = cancelLineSchema.extend({ orderItemId: z.string().cuid() });

/**
 * Cancel part or all of a line.
 *
 * The row is kept with a cancelledQty rather than deleted, so the bill can
 * always be reconciled against what was actually sent to the kitchen.
 */
export const PATCH = route(
  { permission: PERMISSIONS.ORDER_CANCEL, bodySchema: cancelBody },
  async ({ body, params, session }) => {
    const item = await prisma.orderItem.findUnique({
      where: { id: body.orderItemId },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!item || item.orderId !== params.id) throw new HttpError(404, 'Order line not found', 'not_found');
    if (['COMPLETED', 'CANCELLED'].includes(item.order.status)) {
      throw new HttpError(409, 'This order is closed.', 'order_locked');
    }

    const remaining = item.quantity - item.cancelledQty;
    if (body.quantity > remaining) {
      throw new HttpError(422, `Only ${remaining} of that line is left to cancel.`, 'invalid_quantity');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          cancelledQty: { increment: body.quantity },
          status: item.cancelledQty + body.quantity >= item.quantity ? 'CANCELLED' : item.status,
        },
      });
      return recalculateOrder(tx, params.id);
    });

    await audit({
      session,
      action: 'order.line_cancelled',
      entity: 'OrderItem',
      entityId: item.id,
      severity: 'MEDIUM',
      before: { itemName: item.itemName, quantity: item.quantity },
      after: { cancelled: body.quantity, reason: body.reason },
    });

    return apiSuccess(updated);
  },
);
