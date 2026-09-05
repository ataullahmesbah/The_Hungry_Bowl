import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { orderStatusSchema } from '@/lib/validation/orders';
import { assertTransition } from '@/lib/service/orders';
import { consumeOrderRecipes, type ConsumptionResult } from '@/lib/service/consumption';
import { publishEvent } from '@/lib/realtime/publish';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const TIMESTAMP_FIELD: Record<string, string> = {
  PLACED: 'placedAt',
  ACCEPTED: 'acceptedAt',
  READY: 'readyAt',
  SERVED: 'servedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};

export const PATCH = route(
  { permission: PERMISSIONS.ORDER_EDIT, bodySchema: orderStatusSchema },
  async ({ body, params, session }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { table: { select: { name: true } }, kitchenTicket: { select: { id: true } } },
    });
    if (!order) throw new HttpError(404, 'Order not found', 'not_found');

    assertTransition(order.status, body.status);

    if (body.status === 'CANCELLED' && !session!.user.permissions.has(PERMISSIONS.ORDER_CANCEL)) {
      throw new HttpError(403, 'You do not have permission to cancel orders.', 'forbidden');
    }

    // Completing an order is what closes its money, so it must be settled.
    if (body.status === 'COMPLETED' && Number(order.dueAmount) > 0.009) {
      throw new HttpError(
        409,
        `This order still has ${Number(order.dueAmount).toFixed(2)} outstanding. Record the payment before completing it.`,
        'unpaid_order',
      );
    }

    if (body.status === 'CANCELLED' && Number(order.paidAmount) > 0.009) {
      throw new HttpError(
        409,
        'This order has already been paid. Refund the payment before cancelling it.',
        'paid_order',
      );
    }

    const timestampField = TIMESTAMP_FIELD[body.status];
    let consumption: ConsumptionResult | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: params.id },
        data: {
          status: body.status,
          ...(timestampField ? { [timestampField]: new Date() } : {}),
          // A cancelled order owes nothing. Leaving a due amount on it would
          // let it drift into an outstanding-balance report later.
          ...(body.status === 'CANCELLED'
            ? { cancelReason: body.note ?? null, dueAmount: new Prisma.Decimal(0) }
            : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: params.id,
          fromStatus: order.status,
          toStatus: body.status,
          note: body.note ?? null,
          changedById: session!.user.id,
        },
      });

      if (body.status === 'CANCELLED' && order.kitchenTicket) {
        await tx.kitchenTicket.update({
          where: { id: order.kitchenTicket.id },
          data: { status: 'CANCELLED' },
        });
      }

      // Completing the order is the moment the food is definitely gone, so it
      // is where recipe ingredients come off the kitchen stock.
      if (body.status === 'COMPLETED') {
        consumption = await consumeOrderRecipes(tx, params.id, session!.user.id);
      }

      return row;
    });

    await publishEvent({
      channel: 'orders',
      type: 'order.status_changed',
      payload: {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        secretCode: updated.secretCode,
        status: updated.status,
        tableName: order.table?.name ?? null,
      },
      requiredPermission: PERMISSIONS.ORDER_VIEW,
    });

    if (body.status === 'CANCELLED') {
      await notify({
        type: 'order.cancelled',
        title: `Order #${updated.orderNumber} cancelled`,
        body: body.note ?? undefined,
        level: 'WARNING',
        href: `/dashboard/orders/${updated.id}`,
        permissions: [PERMISSIONS.ORDER_VIEW, PERMISSIONS.KITCHEN_VIEW],
        excludeUserId: session!.user.id,
      });
    }

    await audit({
      session,
      action: 'order.status_changed',
      entity: 'Order',
      entityId: updated.id,
      severity: body.status === 'CANCELLED' ? 'MEDIUM' : 'LOW',
      before: { status: order.status },
      after: { status: updated.status, note: body.note },
    });

    if (consumption) {
      const result = consumption as ConsumptionResult;
      if (result.skipped.some((s) => s.reason === 'short_stock')) {
        await notify({
          type: 'stock.shortfall',
          title: `Stock went negative completing order #${updated.orderNumber}`,
          body: result.skipped
            .filter((s) => s.reason === 'short_stock')
            .map((s) => s.detail)
            .join(' '),
          level: 'WARNING',
          href: '/dashboard/inventory',
          permissions: [PERMISSIONS.INVENTORY_MANAGE],
        });
      }
    }

    return apiSuccess({ ...updated, consumption });
  },
);
