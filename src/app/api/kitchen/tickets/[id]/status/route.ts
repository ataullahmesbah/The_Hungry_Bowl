import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { publishEvent } from '@/lib/realtime/publish';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const bodySchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']),
  note: z.string().max(300).nullable().optional(),
});

const KITCHEN_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACCEPTED', 'PREPARING'],
  ACCEPTED: ['PREPARING', 'READY'],
  PREPARING: ['READY'],
  READY: ['SERVED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Which order status each kitchen step drags the order to. */
const ORDER_MIRROR: Record<string, string> = {
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
};

export const PATCH = route(
  { permission: PERMISSIONS.KITCHEN_UPDATE_STATUS, bodySchema },
  async ({ body, params, session }) => {
    const ticket = await prisma.kitchenTicket.findUnique({
      where: { id: params.id },
      include: {
        order: { select: { id: true, orderNumber: true, secretCode: true, status: true, table: { select: { name: true } } } },
      },
    });
    if (!ticket) throw new HttpError(404, 'Kitchen ticket not found', 'not_found');

    const allowed = KITCHEN_TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw new HttpError(
        409,
        `A ticket that is ${ticket.status.toLowerCase()} cannot be moved to ${body.status.toLowerCase()}.`,
        'invalid_transition',
      );
    }

    // Accepting a ticket is the manager's call, not general kitchen staff's.
    if (body.status === 'ACCEPTED' && !session!.user.permissions.has(PERMISSIONS.KITCHEN_ACCEPT)) {
      throw new HttpError(403, 'Only a kitchen manager can accept new tickets.', 'forbidden');
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.kitchenTicket.update({
        where: { id: params.id },
        data: {
          status: body.status,
          note: body.note ?? ticket.note,
          ...(body.status === 'ACCEPTED' ? { acceptedAt: now, acceptedById: session!.user.id } : {}),
          ...(body.status === 'READY' ? { readyAt: now } : {}),
          ...(body.status === 'SERVED' ? { servedAt: now } : {}),
        },
      });

      await tx.kitchenTicketItem.updateMany({
        where: { ticketId: params.id, status: { notIn: ['CANCELLED'] } },
        data: { status: body.status },
      });

      await tx.kitchenStatusHistory.create({
        data: {
          ticketId: params.id,
          fromStatus: ticket.status,
          toStatus: body.status,
          changedById: session!.user.id,
        },
      });

      // Keep the order in step so the floor sees the same picture as the pass.
      const mirrored = ORDER_MIRROR[body.status];
      if (mirrored && ticket.order.status !== mirrored) {
        await tx.order.update({
          where: { id: ticket.orderId },
          data: {
            status: mirrored as never,
            ...(mirrored === 'ACCEPTED' ? { acceptedAt: now } : {}),
            ...(mirrored === 'READY' ? { readyAt: now } : {}),
            ...(mirrored === 'SERVED' ? { servedAt: now } : {}),
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: ticket.orderId,
            fromStatus: ticket.order.status,
            toStatus: mirrored as never,
            note: 'Updated from the kitchen display',
            changedById: session!.user.id,
          },
        });
      }

      return row;
    });

    await publishEvent({
      channel: 'kitchen',
      type: `kitchen.${body.status.toLowerCase()}`,
      payload: {
        ticketId: updated.id,
        orderId: ticket.orderId,
        orderNumber: ticket.order.orderNumber,
        secretCode: ticket.order.secretCode,
        tableName: ticket.order.table?.name ?? null,
        status: body.status,
      },
      requiredPermission: PERMISSIONS.ORDER_VIEW,
    });

    // Only the two moments the floor actually needs to act on.
    if (body.status === 'ACCEPTED' || body.status === 'READY') {
      await notify({
        type: `kitchen.${body.status.toLowerCase()}`,
        title:
          body.status === 'READY'
            ? `Order #${ticket.order.orderNumber} is ready${ticket.order.table ? ` for table ${ticket.order.table.name}` : ''}`
            : `Kitchen accepted order #${ticket.order.orderNumber}`,
        body: `Code ${ticket.order.secretCode}`,
        level: body.status === 'READY' ? 'SUCCESS' : 'INFO',
        href: `/dashboard/orders/${ticket.orderId}`,
        permissions: [PERMISSIONS.ORDER_CREATE, PERMISSIONS.TABLE_SESSION_MANAGE],
        excludeUserId: session!.user.id,
      });
    }

    await audit({
      session,
      action: `kitchen.${body.status.toLowerCase()}`,
      entity: 'KitchenTicket',
      entityId: updated.id,
      before: { status: ticket.status },
      after: { status: body.status, orderNumber: ticket.order.orderNumber },
    });

    return apiSuccess(updated);
  },
);
