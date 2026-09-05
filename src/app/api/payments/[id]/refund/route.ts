import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { refundSchema } from '@/lib/validation/orders';
import { recalculateOrder } from '@/lib/service/orders';
import { dec } from '@/lib/money';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Refunds add to the record rather than editing it.
 *
 * PRD §20: a paid transaction is never silently overwritten. The original
 * payment row keeps its amount; the refund is stored alongside it, so the
 * history shows both what was taken and what was given back.
 */
export const POST = route(
  { permission: PERMISSIONS.PAYMENT_REFUND, bodySchema: refundSchema },
  async ({ body, params, session }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: { order: { select: { id: true, orderNumber: true } }, method: { select: { name: true } } },
    });
    if (!payment) throw new HttpError(404, 'Payment not found', 'not_found');
    if (payment.status === 'VOIDED') throw new HttpError(409, 'This payment was voided.', 'payment_voided');

    const refundable = Number(payment.amount) - Number(payment.refundedAmount);
    if (body.amount > refundable + 0.001) {
      throw new HttpError(
        422,
        `Only ${refundable.toFixed(2)} of this payment can still be refunded.`,
        'refund_too_large',
        { amount: `Maximum ${refundable.toFixed(2)}` },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.payment.update({
        where: { id: params.id },
        data: {
          refundedAmount: { increment: dec(body.amount) },
          refundedAt: new Date(),
          refundedById: session!.user.id,
          refundReason: body.reason.trim(),
          status: Number(payment.refundedAmount) + body.amount >= Number(payment.amount) ? 'REFUNDED' : 'COMPLETED',
        },
      });
      await recalculateOrder(tx, payment.orderId);
      return row;
    });

    await notify({
      type: 'payment.refunded',
      title: `Refund on order #${payment.order.orderNumber}`,
      body: `${body.amount.toFixed(2)} refunded via ${payment.method.name}. Reason: ${body.reason}`,
      level: 'WARNING',
      href: `/dashboard/orders/${payment.orderId}`,
      permissions: [PERMISSIONS.FINANCE_VIEW],
      excludeUserId: session!.user.id,
    });

    await audit({
      session,
      action: 'payment.refunded',
      entity: 'Payment',
      entityId: payment.id,
      severity: 'HIGH',
      before: { amount: Number(payment.amount), refunded: Number(payment.refundedAmount) },
      after: { refunded: Number(updated.refundedAmount), reason: body.reason, orderNumber: payment.order.orderNumber },
    });

    return apiSuccess(updated);
  },
);
