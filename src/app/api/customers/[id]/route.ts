import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { customerInputSchema } from '@/lib/validation/service';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.CUSTOMER_VIEW }, async ({ params }) => {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      reservations: { orderBy: { reservedAt: 'desc' }, take: 10 },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, orderNumber: true, totalAmount: true, status: true, createdAt: true },
      },
    },
  });
  if (!customer || customer.deletedAt) throw new HttpError(404, 'Customer not found', 'not_found');
  return apiSuccess(customer);
});

export const PATCH = route(
  { permission: PERMISSIONS.CUSTOMER_MANAGE, bodySchema: customerInputSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.customer.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Customer not found', 'not_found');

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.email !== undefined ? { email: body.email?.trim() || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        ...(body.isBlacklisted !== undefined ? { isBlacklisted: body.isBlacklisted } : {}),
      },
    });

    await audit({
      session,
      action: 'customer.updated',
      entity: 'Customer',
      entityId: customer.id,
      before: { name: before.name, isBlacklisted: before.isBlacklisted },
      after: { name: customer.name, isBlacklisted: customer.isBlacklisted },
    });
    return apiSuccess(customer);
  },
);

export const DELETE = route({ permission: PERMISSIONS.CUSTOMER_MANAGE }, async ({ params, session }) => {
  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer || customer.deletedAt) throw new HttpError(404, 'Customer not found', 'not_found');

  await prisma.customer.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await audit({ session, action: 'customer.removed', entity: 'Customer', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ removed: true });
});
