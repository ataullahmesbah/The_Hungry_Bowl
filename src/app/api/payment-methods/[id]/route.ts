import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { paymentMethodSchema } from '@/lib/validation/orders';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.PAYMENT_METHOD_MANAGE, bodySchema: paymentMethodSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.paymentMethod.findUnique({ where: { id: params.id } });
    if (!before) throw new HttpError(404, 'Payment method not found', 'not_found');

    const method = await prisma.paymentMethod.update({ where: { id: params.id }, data: body });
    await audit({
      session,
      action: 'payment_method.updated',
      entity: 'PaymentMethod',
      entityId: method.id,
      severity: 'MEDIUM',
      before: { name: before.name, isActive: before.isActive },
      after: { name: method.name, isActive: method.isActive },
    });
    return apiSuccess(method);
  },
);

/**
 * Methods are deactivated, never deleted — every historical payment points at
 * one, and removing the row would orphan the sales history.
 */
export const DELETE = route({ permission: PERMISSIONS.PAYMENT_METHOD_MANAGE }, async ({ params, session }) => {
  const method = await prisma.paymentMethod.findUnique({
    where: { id: params.id },
    include: { _count: { select: { payments: true } } },
  });
  if (!method) throw new HttpError(404, 'Payment method not found', 'not_found');

  await prisma.paymentMethod.update({ where: { id: params.id }, data: { isActive: false } });
  await audit({ session, action: 'payment_method.deactivated', entity: 'PaymentMethod', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ deactivated: true, historicalPayments: method._count.payments });
});
