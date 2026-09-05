import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { updateOrderSchema } from '@/lib/validation/orders';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.ORDER_VIEW }, async ({ params }) => {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { options: true }, orderBy: { createdAt: 'asc' } },
      table: { select: { id: true, name: true } },
      session: { select: { id: true, code: true, status: true } },
      customer: { select: { id: true, name: true, phone: true } },
      payments: {
        orderBy: { receivedAt: 'desc' },
        include: { method: { select: { id: true, name: true, kind: true } } },
      },
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
      kitchenTicket: { select: { id: true, status: true, receivedAt: true, acceptedAt: true, readyAt: true } },
      receipts: { orderBy: { issuedAt: 'desc' }, select: { id: true, receiptNo: true, issuedAt: true } },
    },
  });

  if (!order) throw new HttpError(404, 'Order not found', 'not_found');
  return apiSuccess(order);
});

export const PATCH = route(
  { permission: PERMISSIONS.ORDER_EDIT, bodySchema: updateOrderSchema },
  async ({ body, params, session }) => {
    const before = await prisma.order.findUnique({ where: { id: params.id } });
    if (!before) throw new HttpError(404, 'Order not found', 'not_found');
    if (['COMPLETED', 'CANCELLED'].includes(before.status)) {
      throw new HttpError(409, 'A completed or cancelled order cannot be edited.', 'order_locked');
    }

    const order = await prisma.order.update({
      where: { id: params.id },
      data: {
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.guestName !== undefined ? { guestName: body.guestName } : {}),
        ...(body.guestPhone !== undefined ? { guestPhone: body.guestPhone } : {}),
        ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
      },
    });

    await audit({ session, action: 'order.updated', entity: 'Order', entityId: order.id, before: { note: before.note }, after: { note: order.note } });
    return apiSuccess(order);
  },
);
