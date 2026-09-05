import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { inventoryItemSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.INVENTORY_VIEW }, async ({ params }) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: params.id },
    include: {
      unit: true,
      category: true,
      balances: { include: { warehouse: { select: { id: true, name: true, kind: true } } } },
      movements: {
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
        },
      },
      recipeLines: { include: { recipe: { include: { variant: { include: { menuItem: { select: { name: true } } } } } } } },
    },
  });
  if (!item || item.deletedAt) throw new HttpError(404, 'Inventory item not found', 'not_found');
  return apiSuccess(item);
});

export const PATCH = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: inventoryItemSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.inventoryItem.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Inventory item not found', 'not_found');

    const item = await prisma.inventoryItem.update({
      where: { id: params.id },
      data: { ...body, ...(body.sku !== undefined ? { sku: body.sku?.trim() || null } : {}) },
    });
    await audit({
      session,
      action: 'inventory.item_updated',
      entity: 'InventoryItem',
      entityId: item.id,
      before: { name: before.name, reorderLevel: Number(before.reorderLevel) },
      after: { name: item.name, reorderLevel: Number(item.reorderLevel) },
    });
    return apiSuccess(item);
  },
);

/**
 * Archived, never deleted: the movement ledger and past recipes point at this
 * row, and removing it would leave holes in the stock history.
 */
export const DELETE = route({ permission: PERMISSIONS.INVENTORY_MANAGE }, async ({ params, session }) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: params.id },
    include: {
      balances: { select: { quantity: true } },
      _count: { select: { recipeLines: true } },
    },
  });
  if (!item || item.deletedAt) throw new HttpError(404, 'Inventory item not found', 'not_found');

  const stock = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
  if (stock > 0.0001) {
    throw new HttpError(
      409,
      `There is still ${stock} in stock. Write it off as wastage or transfer it out before archiving.`,
      'stock_remaining',
    );
  }
  if (item._count.recipeLines > 0) {
    throw new HttpError(
      409,
      `This ingredient is used in ${item._count.recipeLines} recipe(s). Remove it from them first.`,
      'in_use',
    );
  }

  await prisma.inventoryItem.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ session, action: 'inventory.item_archived', entity: 'InventoryItem', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ archived: true });
});
