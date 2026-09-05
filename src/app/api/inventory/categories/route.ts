import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { inventoryCategorySchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.INVENTORY_VIEW }, async () =>
  apiSuccess(
    await prisma.inventoryCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    }),
  ),
);

export const POST = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: inventoryCategorySchema },
  async ({ body, session }) => {
    const category = await prisma.inventoryCategory.create({ data: body });
    await audit({ session, action: 'inventory.category_created', entity: 'InventoryCategory', entityId: category.id, after: body });
    return apiSuccess(category, { status: 201 });
  },
);
