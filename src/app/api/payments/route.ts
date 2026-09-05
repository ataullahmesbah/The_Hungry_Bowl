import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { paymentSchema } from '@/lib/validation/orders';
import { recalculateOrder } from '@/lib/service/orders';
import { dec } from '@/lib/money';
import { publishEvent } from '@/lib/realtime/publish';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  orderId: z.string().cuid().optional(),
  methodId: z.string().cuid().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'VOIDED']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.PAYMENT_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.PaymentWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.methodId ? { methodId: query.methodId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            receivedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total, sum] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        ...paginate(query),
        include: {
          method: { select: { id: true, name: true, kind: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              secretCode: true,
              totalAmount: true,
              table: { select: { name: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { amount: true, refundedAmount: true } }),
    ]);

    return apiSuccess({
      items,
      meta: pageMeta(total, query),
      totals: {
        received: Number(sum._sum.amount ?? 0),
        refunded: Number(sum._sum.refundedAmount ?? 0),
        net: Number(sum._sum.amount ?? 0) - Number(sum._sum.refundedAmount ?? 0),
      },
    });
  },
);

/**
 * Record money received at the restaurant.
 *
 * PRD acceptance criterion: a payment cannot exist without an order, which is
 * why orderId is required and verified here rather than being optional.
 *
 * Card data: only the last digits ever reach the database. There is no field
 * anywhere in this application for a full card number or a CVV, so there is
 * nothing to leak.
 */
export const POST = route(
  { permission: PERMISSIONS.PAYMENT_RECORD, bodySchema: paymentSchema },
  async ({ body, session }) => {
    const [order, method] = await Promise.all([
      prisma.order.findUnique({
        where: { id: body.orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          dueAmount: true,
          sessionId: true,
        },
      }),
      prisma.paymentMethod.findUnique({ where: { id: body.methodId } }),
    ]);

    if (!order) throw new HttpError(404, 'Order not found', 'not_found');
    if (!method || !method.isActive) throw new HttpError(404, 'Payment method not available', 'not_found');
    if (order.status === 'CANCELLED') {
      throw new HttpError(409, 'This order was cancelled and cannot take a payment.', 'order_cancelled');
    }
    if (method.requiresReference && !body.reference?.trim()) {
      throw new HttpError(422, `${method.name} needs a transaction reference.`, 'reference_required', {
        reference: 'Enter the transaction id',
      });
    }

    // Overpaying is almost always a typo or a duplicate entry, so both cases
    // are refused: a second payment on a settled order, and an amount larger
    // than what is still outstanding.
    const due = Number(order.dueAmount);
    if (due <= 0.009) {
      throw new HttpError(
        409,
        'This order is already fully paid. Record a tip on the existing payment, or refund it if the amount was wrong.',
        'already_paid',
      );
    }
    if (body.amount > due + 0.5) {
      throw new HttpError(
        422,
        `That is more than the ${due.toFixed(2)} outstanding on this order. Check the amount, or record the extra as a tip.`,
        'overpayment',
        { amount: `Outstanding is ${due.toFixed(2)}` },
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: body.orderId,
          methodId: body.methodId,
          amount: dec(body.amount),
          status: 'COMPLETED',
          reference: body.reference?.trim() || null,
          maskedAccount: body.maskedAccount?.trim() || null,
          accountLabel: body.accountLabel?.trim() || null,
          tipAmount: dec(body.tipAmount),
          changeGiven: dec(body.changeGiven),
          note: body.note?.trim() || null,
          receivedById: session!.user.id,
          // Server clock only — never a timestamp supplied by the client.
          receivedAt: new Date(),
        },
        include: { method: { select: { name: true } } },
      });

      await recalculateOrder(tx, body.orderId);
      return created;
    });

    await publishEvent({
      channel: 'orders',
      type: 'payment.recorded',
      payload: { orderId: order.id, orderNumber: order.orderNumber, amount: body.amount, method: method.name },
      requiredPermission: PERMISSIONS.PAYMENT_VIEW,
    });

    await audit({
      session,
      action: 'payment.recorded',
      entity: 'Payment',
      entityId: payment.id,
      severity: 'HIGH',
      after: {
        orderNumber: order.orderNumber,
        amount: body.amount,
        method: method.name,
        reference: body.reference ? `••••${body.reference.slice(-4)}` : null,
      },
    });

    return apiSuccess(payment, { status: 201 });
  },
);
