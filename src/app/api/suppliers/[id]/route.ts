import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { supplierSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.PURCHASE_VIEW }, async ({ params }) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      purchases: {
        orderBy: { purchaseDate: 'desc' },
        take: 20,
        select: { id: true, purchaseNo: true, purchaseDate: true, totalAmount: true, dueAmount: true, status: true },
      },
    },
  });
  if (!supplier || supplier.deletedAt) throw new HttpError(404, 'Supplier not found', 'not_found');
  return apiSuccess(supplier);
});

export const PATCH = route(
  { permission: PERMISSIONS.SUPPLIER_MANAGE, bodySchema: supplierSchema.partial() },
  async ({ body, params, session }) => {
    const supplier = await prisma.supplier.update({
      where: { id: params.id },
      data: { ...body, ...(body.email !== undefined ? { email: body.email?.trim() || null } : {}) },
    });
    await audit({ session, action: 'purchasing.supplier_updated', entity: 'Supplier', entityId: supplier.id, after: { name: supplier.name } });
    return apiSuccess(supplier);
  },
);

export const DELETE = route({ permission: PERMISSIONS.SUPPLIER_MANAGE }, async ({ params, session }) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!supplier || supplier.deletedAt) throw new HttpError(404, 'Supplier not found', 'not_found');

  if (Number(supplier.outstandingBalance) > 0.009) {
    throw new HttpError(
      409,
      `This supplier still has ${Number(supplier.outstandingBalance).toFixed(2)} outstanding. Settle it first.`,
      'balance_outstanding',
    );
  }

  await prisma.supplier.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ session, action: 'purchasing.supplier_archived', entity: 'Supplier', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ archived: true });
});
