import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { warehouseSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.INVENTORY_VIEW }, async () => {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { balances: true } } },
  });

  const values = await prisma.stockBalance.groupBy({ by: ['warehouseId'], _sum: { quantity: true } });
  const byWarehouse = new Map(values.map((v) => [v.warehouseId, Number(v._sum.quantity ?? 0)]));

  return apiSuccess(
    warehouses.map((w) => ({ ...w, totalQuantity: Number((byWarehouse.get(w.id) ?? 0).toFixed(3)) })),
  );
});

export const POST = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: warehouseSchema },
  async ({ body, session }) => {
    const warehouse = await prisma.$transaction(async (tx) => {
      // Only one location can be the default for each purpose, otherwise
      // recipe consumption would not know where to deduct from.
      if (body.isDefaultReceiving) {
        await tx.warehouse.updateMany({ where: { isDefaultReceiving: true }, data: { isDefaultReceiving: false } });
      }
      if (body.isDefaultConsumption) {
        await tx.warehouse.updateMany({ where: { isDefaultConsumption: true }, data: { isDefaultConsumption: false } });
      }
      return tx.warehouse.create({ data: body });
    });

    await audit({ session, action: 'inventory.warehouse_created', entity: 'Warehouse', entityId: warehouse.id, after: body });
    return apiSuccess(warehouse, { status: 201 });
  },
);
