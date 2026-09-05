import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { discountSchema } from '@/lib/validation/orders';
import { recalculateOrder } from '@/lib/service/orders';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Discounts are a separate permission from editing an order, because giving
 * money away is a different level of trust from adding a plate of rice.
 */
export const PATCH = route(
  { permission: PERMISSIONS.ORDER_DISCOUNT, bodySchema: discountSchema },
  async ({ body, params, session }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) throw new HttpError(404, 'Order not found', 'not_found');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      throw new HttpError(409, 'This order is closed and its total cannot change.', 'order_locked');
    }
    if (body.discountAmount > Number(order.subtotal)) {
      throw new HttpError(422, 'A discount cannot be larger than the order subtotal.', 'discount_too_large');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: params.id },
        data: { discountAmount: body.discountAmount, discountReason: body.discountReason ?? null },
      });
      return recalculateOrder(tx, params.id);
    });

    await audit({
      session,
      action: 'order.discount_applied',
      entity: 'Order',
      entityId: order.id,
      severity: 'HIGH',
      before: { discount: Number(order.discountAmount), total: Number(order.totalAmount) },
      after: { discount: body.discountAmount, reason: body.discountReason, total: Number(updated.totalAmount) },
    });

    return apiSuccess(updated);
  },
);
