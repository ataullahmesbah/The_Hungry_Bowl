import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { voidSchema } from '@/lib/validation/orders';
import { recalculateOrder } from '@/lib/service/orders';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Voiding is for a payment recorded in error — a wrong table, a duplicate
 * entry. The row stays with a VOIDED status and a reason, so the correction is
 * visible in the audit trail rather than the mistake simply vanishing.
 */
export const POST = route(
  { permission: PERMISSIONS.PAYMENT_VOID, bodySchema: voidSchema },
  async ({ body, params, session }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: { order: { select: { id: true, orderNumber: true } } },
    });
    if (!payment) throw new HttpError(404, 'Payment not found', 'not_found');
    if (payment.status === 'VOIDED') throw new HttpError(409, 'This payment is already voided.', 'already_voided');
    if (Number(payment.refundedAmount) > 0) {
      throw new HttpError(409, 'This payment has been refunded. Voiding it would double-count the correction.', 'already_refunded');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.payment.update({
        where: { id: params.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: session!.user.id,
          voidReason: body.reason.trim(),
        },
      });
      await recalculateOrder(tx, payment.orderId);
      return row;
    });

    await notify({
      type: 'payment.voided',
      title: `Payment voided on order #${payment.order.orderNumber}`,
      body: `${Number(payment.amount).toFixed(2)} voided. Reason: ${body.reason}`,
      level: 'CRITICAL',
      href: `/dashboard/orders/${payment.orderId}`,
      permissions: [PERMISSIONS.FINANCE_VIEW],
      excludeUserId: session!.user.id,
    });

    await audit({
      session,
      action: 'payment.voided',
      entity: 'Payment',
      entityId: payment.id,
      severity: 'HIGH',
      before: { amount: Number(payment.amount), status: payment.status },
      after: { status: 'VOIDED', reason: body.reason, orderNumber: payment.order.orderNumber },
    });

    return apiSuccess(updated);
  },
);
