import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { closeSessionSchema } from '@/lib/validation/service';
import { summariseSession } from '@/lib/service/sessions';
import { publishEvent } from '@/lib/realtime/publish';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Clear the table.
 *
 * Closing is refused while the party still owes money or has food in the
 * kitchen, so a bill can never be lost by clearing a table. A manager with the
 * payment permission can override, and the override is audited as HIGH.
 */
export const PATCH = route(
  { permission: PERMISSIONS.TABLE_SESSION_MANAGE, bodySchema: closeSessionSchema },
  async ({ body, params, session }) => {
    const record = await prisma.tableSession.findUnique({
      where: { id: params.id },
      include: {
        table: { select: { id: true, name: true } },
        orders: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            dueAmount: true,
          },
        },
      },
    });

    if (!record) throw new HttpError(404, 'Session not found', 'not_found');
    if (record.status !== 'OPEN') {
      throw new HttpError(409, 'This session is already closed.', 'session_closed');
    }

    const totals = summariseSession(record.orders);

    if (totals.hasOpenOrders && !body.forceWithUnpaid) {
      throw new HttpError(
        409,
        'Some orders for this table are still in the kitchen or waiting to be served. Finish or cancel them first.',
        'orders_in_progress',
        { totals },
      );
    }

    if (totals.hasUnpaid && !body.forceWithUnpaid) {
      throw new HttpError(
        409,
        `This table still owes ${totals.due.toFixed(2)}. Record the payment first, or close with an override.`,
        'unpaid_balance',
        { totals },
      );
    }

    const forced = (totals.hasUnpaid || totals.hasOpenOrders) && body.forceWithUnpaid;
    if (forced && !session!.user.permissions.has(PERMISSIONS.PAYMENT_RECORD)) {
      throw new HttpError(
        403,
        'Only a manager who can record payments may close a table with an unpaid balance.',
        'forbidden',
      );
    }

    const closed = await prisma.$transaction(async (tx) => {
      const row = await tx.tableSession.update({
        where: { id: params.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: session!.user.id,
          notes: body.notes?.trim() || record.notes,
        },
      });

      await tx.restaurantTable.update({
        where: { id: record.tableId },
        data: { status: body.markForCleaning ? 'CLEANING' : 'FREE' },
      });

      if (record.customerId) {
        await tx.customer.update({
          where: { id: record.customerId },
          data: { totalSpend: { increment: totals.paid } },
        });
      }

      return row;
    });

    await publishEvent({
      channel: 'tables',
      type: 'session.closed',
      payload: { sessionId: closed.id, tableId: record.tableId, tableName: record.table.name },
      requiredPermission: PERMISSIONS.TABLE_VIEW,
    });

    if (forced) {
      await notify({
        type: 'session.closed_with_balance',
        title: `Table ${record.table.name} closed with an unpaid balance`,
        body: `Session ${record.code} was closed by ${session!.user.name} with ${totals.due.toFixed(2)} outstanding.`,
        level: 'CRITICAL',
        href: '/dashboard/payments',
        permissions: [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.PAYMENT_VIEW],
        excludeUserId: session!.user.id,
      });
    }

    await audit({
      session,
      action: forced ? 'session.closed_forced' : 'session.closed',
      entity: 'TableSession',
      entityId: closed.id,
      severity: forced ? 'HIGH' : 'LOW',
      before: { code: record.code, table: record.table.name },
      after: { totals, forced },
    });

    return apiSuccess({ ...closed, totals });
  },
);
