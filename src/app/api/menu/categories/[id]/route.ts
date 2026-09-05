import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { categoryInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: categoryInputSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.menuCategory.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Category not found', 'not_found');

    const category = await prisma.menuCategory.update({ where: { id: params.id }, data: body });
    await audit({
      session,
      action: 'menu.category_updated',
      entity: 'MenuCategory',
      entityId: category.id,
      before,
      after: category,
    });
    return apiSuccess(category);
  },
);

/**
 * Archive rather than hard-delete: a category that has ever been ordered from
 * is part of the sales history, and dropping the row would orphan reports.
 */
export const DELETE = route({ permission: PERMISSIONS.MENU_DELETE }, async ({ params, session }) => {
  const category = await prisma.menuCategory.findUnique({
    where: { id: params.id },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  if (!category || category.deletedAt) throw new HttpError(404, 'Category not found', 'not_found');

  if (category._count.items > 0) {
    throw new HttpError(
      409,
      `Move or archive the ${category._count.items} item(s) in this category first.`,
      'category_not_empty',
    );
  }

  await prisma.menuCategory.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });
  await audit({
    session,
    action: 'menu.category_archived',
    entity: 'MenuCategory',
    entityId: params.id,
    severity: 'MEDIUM',
    before: category,
  });
  return apiSuccess({ archived: true });
});
