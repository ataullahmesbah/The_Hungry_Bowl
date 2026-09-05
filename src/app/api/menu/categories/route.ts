import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { categoryInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';

const listQuery = z.object({
  includeArchived: z.enum(['true', 'false']).default('false'),
});

export const GET = route(
  { permission: PERMISSIONS.MENU_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const categories = await prisma.menuCategory.findMany({
      where: {
        deletedAt: null,
        ...(query.includeArchived === 'true' ? {} : { status: { not: 'ARCHIVED' as const } }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    return apiSuccess(categories);
  },
);

export const POST = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: categoryInputSchema },
  async ({ body, session }) => {
    const category = await prisma.menuCategory.create({ data: body });
    await audit({ session, action: 'menu.category_created', entity: 'MenuCategory', entityId: category.id, after: body });
    return apiSuccess(category, { status: 201 });
  },
);
