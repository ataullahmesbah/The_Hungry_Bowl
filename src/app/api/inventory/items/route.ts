import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { inventoryItemSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({
  search: z.string().max(120).optional(),
  categoryId: z.string().cuid().optional(),
  filter: z.enum(['low', 'critical', 'all']).default('all'),
});

export const GET = route(
  { permission: PERMISSIONS.INVENTORY_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        orderBy: { name: 'asc' },
        ...paginate(query),
        include: {
          unit: { select: { code: true, name: true } },
          category: { select: { id: true, name: true } },
          balances: { select: { quantity: true, warehouse: { select: { id: true, name: true, kind: true } } } },
        },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    const items = rows.map((item) => {
      const stock = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
      return {
        ...item,
        totalStock: Number(stock.toFixed(3)),
        isLow: Number(item.reorderLevel) > 0 && stock <= Number(item.reorderLevel),
        isCritical: Number(item.criticalLevel) > 0 && stock <= Number(item.criticalLevel),
      };
    });

    const filtered =
      query.filter === 'low'
        ? items.filter((i) => i.isLow)
        : query.filter === 'critical'
          ? items.filter((i) => i.isCritical)
          : items;

    return apiSuccess({ items: filtered, meta: pageMeta(total, query) });
  },
);

export const POST = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: inventoryItemSchema },
  async ({ body, session }) => {
    const item = await prisma.inventoryItem.create({
      data: { ...body, sku: body.sku?.trim() || null },
      include: { unit: true },
    });
    await audit({ session, action: 'inventory.item_created', entity: 'InventoryItem', entityId: item.id, after: { name: item.name } });
    return apiSuccess(item, { status: 201 });
  },
);
