import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { warehouseSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: warehouseSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.warehouse.findUnique({ where: { id: params.id } });
    if (!before) throw new HttpError(404, 'Warehouse not found', 'not_found');

    const warehouse = await prisma.$transaction(async (tx) => {
      if (body.isDefaultReceiving) {
        await tx.warehouse.updateMany({
          where: { isDefaultReceiving: true, NOT: { id: params.id } },
          data: { isDefaultReceiving: false },
        });
      }
      if (body.isDefaultConsumption) {
        await tx.warehouse.updateMany({
          where: { isDefaultConsumption: true, NOT: { id: params.id } },
          data: { isDefaultConsumption: false },
        });
      }
      return tx.warehouse.update({ where: { id: params.id }, data: body });
    });

    await audit({ session, action: 'inventory.warehouse_updated', entity: 'Warehouse', entityId: warehouse.id, before, after: warehouse });
    return apiSuccess(warehouse);
  },
);

export const DELETE = route({ permission: PERMISSIONS.INVENTORY_MANAGE }, async ({ params, session }) => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: params.id },
    include: { balances: { select: { quantity: true } } },
  });
  if (!warehouse) throw new HttpError(404, 'Warehouse not found', 'not_found');

  const stock = warehouse.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
  if (Math.abs(stock) > 0.0001) {
    throw new HttpError(409, `This location still holds stock (${stock}). Move it out first.`, 'stock_remaining');
  }

  await prisma.warehouse.update({ where: { id: params.id }, data: { isActive: false } });
  await audit({ session, action: 'inventory.warehouse_deactivated', entity: 'Warehouse', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ deactivated: true });
});
