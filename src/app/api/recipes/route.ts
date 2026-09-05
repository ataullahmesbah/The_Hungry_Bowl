import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { recipeSchema } from '@/lib/validation/finance';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = z.object({ menuItemId: z.string().cuid().optional() });

export const GET = route(
  { permission: PERMISSIONS.RECIPE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const recipes = await prisma.recipe.findMany({
      where: query.menuItemId ? { variant: { menuItemId: query.menuItemId } } : {},
      orderBy: { variant: { menuItem: { name: 'asc' } } },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            price: true,
            menuItem: { select: { id: true, name: true, slug: true } },
          },
        },
        ingredients: {
          include: { item: { select: { id: true, name: true, avgUnitCost: true, unit: { select: { code: true } } } } },
        },
      },
    });

    return apiSuccess(
      recipes.map((recipe) => {
        // Food cost per portion, using the moving-average cost of each
        // ingredient. This is what makes the margin column meaningful.
        const cost = recipe.ingredients.reduce(
          (sum, line) => sum + Number(line.quantity) * Number(line.item.avgUnitCost),
          0,
        );
        const perPortion = cost / Math.max(1, Number(recipe.yieldQty));
        const price = Number(recipe.variant.price);
        return {
          ...recipe,
          foodCost: Number(perPortion.toFixed(4)),
          margin: price > 0 ? Number((price - perPortion).toFixed(2)) : null,
          costPercent: price > 0 ? Number(((perPortion / price) * 100).toFixed(1)) : null,
        };
      }),
    );
  },
);

export const POST = route(
  { permission: PERMISSIONS.RECIPE_MANAGE, bodySchema: recipeSchema },
  async ({ body, session }) => {
    const variant = await prisma.menuVariant.findUnique({
      where: { id: body.variantId },
      include: { menuItem: { select: { name: true } }, recipe: { select: { id: true } } },
    });
    if (!variant) throw new HttpError(404, 'Menu size not found', 'not_found');
    if (variant.recipe) {
      throw new HttpError(409, 'That size already has a recipe. Edit the existing one instead.', 'recipe_exists');
    }

    const recipe = await prisma.recipe.create({
      data: {
        variantId: body.variantId,
        name: body.name ?? `${variant.menuItem.name} — ${variant.name}`,
        yieldQty: new Prisma.Decimal(body.yieldQty),
        isActive: body.isActive,
        autoConsume: body.autoConsume,
        note: body.note ?? null,
        ingredients: {
          create: body.ingredients.map((line) => ({
            itemId: line.itemId,
            quantity: new Prisma.Decimal(line.quantity),
            note: line.note ?? null,
            isOptional: line.isOptional,
          })),
        },
      },
      include: { ingredients: true },
    });

    await audit({
      session,
      action: 'recipe.created',
      entity: 'Recipe',
      entityId: recipe.id,
      after: { variant: `${variant.menuItem.name} ${variant.name}`, ingredients: recipe.ingredients.length },
    });

    return apiSuccess(recipe, { status: 201 });
  },
);
