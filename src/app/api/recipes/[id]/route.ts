import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { recipeSchema } from '@/lib/validation/finance';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.RECIPE_MANAGE, bodySchema: recipeSchema.partial({ variantId: true }) },
  async ({ body, params, session }) => {
    const before = await prisma.recipe.findUnique({
      where: { id: params.id },
      include: { ingredients: true, variant: { include: { menuItem: { select: { name: true } } } } },
    });
    if (!before) throw new HttpError(404, 'Recipe not found', 'not_found');

    const recipe = await prisma.$transaction(async (tx) => {
      if (body.ingredients) {
        // Replace the ingredient list wholesale: a recipe is a small,
        // self-contained document, so diffing lines adds risk without value.
        await tx.recipeIngredient.deleteMany({ where: { recipeId: params.id } });
        for (const line of body.ingredients) {
          await tx.recipeIngredient.create({
            data: {
              recipeId: params.id,
              itemId: line.itemId,
              quantity: new Prisma.Decimal(line.quantity),
              note: line.note ?? null,
              isOptional: line.isOptional,
            },
          });
        }
      }

      return tx.recipe.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.yieldQty !== undefined ? { yieldQty: new Prisma.Decimal(body.yieldQty) } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.autoConsume !== undefined ? { autoConsume: body.autoConsume } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
        include: { ingredients: true },
      });
    });

    await audit({
      session,
      action: 'recipe.updated',
      entity: 'Recipe',
      entityId: recipe.id,
      before: { ingredients: before.ingredients.length, autoConsume: before.autoConsume },
      after: { ingredients: recipe.ingredients.length, autoConsume: recipe.autoConsume },
    });

    return apiSuccess(recipe);
  },
);

export const DELETE = route({ permission: PERMISSIONS.RECIPE_MANAGE }, async ({ params, session }) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: params.id } });
  if (!recipe) throw new HttpError(404, 'Recipe not found', 'not_found');

  await prisma.recipe.delete({ where: { id: params.id } });
  await audit({ session, action: 'recipe.deleted', entity: 'Recipe', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ deleted: true });
});
