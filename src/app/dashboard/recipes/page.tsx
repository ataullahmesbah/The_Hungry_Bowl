import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { RecipesManager } from './recipes-manager';

export const metadata = { title: 'Recipes' };
export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const session = await requirePagePermission(PERMISSIONS.RECIPE_VIEW, '/dashboard/recipes');
  const settings = await getSettings();

  const [recipes, variants, ingredients, kitchenStore] = await Promise.all([
    prisma.recipe.findMany({
      orderBy: { variant: { menuItem: { name: 'asc' } } },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            price: true,
            menuItem: { select: { id: true, name: true } },
          },
        },
        ingredients: {
          include: { item: { select: { id: true, name: true, avgUnitCost: true, unit: { select: { code: true } } } } },
        },
      },
    }),
    prisma.menuVariant.findMany({
      where: { menuItem: { deletedAt: null, status: { not: 'ARCHIVED' } } },
      orderBy: [{ menuItem: { name: 'asc' } }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        price: true,
        recipe: { select: { id: true } },
        menuItem: { select: { id: true, name: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, avgUnitCost: true, unit: { select: { code: true } } },
    }),
    prisma.warehouse.findFirst({ where: { isDefaultConsumption: true, isActive: true }, select: { name: true } }),
  ]);

  const rows = recipes.map((recipe) => {
    const cost = recipe.ingredients.reduce(
      (sum, line) => sum + Number(line.quantity) * Number(line.item.avgUnitCost),
      0,
    );
    const perPortion = cost / Math.max(1, Number(recipe.yieldQty));
    const price = Number(recipe.variant.price);
    return {
      id: recipe.id,
      name: recipe.name,
      yieldQty: Number(recipe.yieldQty),
      isActive: recipe.isActive,
      autoConsume: recipe.autoConsume,
      note: recipe.note,
      variant: {
        id: recipe.variant.id,
        name: recipe.variant.name,
        price,
        menuItemName: recipe.variant.menuItem.name,
      },
      ingredients: recipe.ingredients.map((line) => ({
        id: line.id,
        itemId: line.item.id,
        itemName: line.item.name,
        unit: line.item.unit.code,
        quantity: Number(line.quantity),
        unitCost: Number(line.item.avgUnitCost),
        isOptional: line.isOptional,
        note: line.note,
      })),
      foodCost: Number(perPortion.toFixed(2)),
      costPercent: price > 0 ? Number(((perPortion / price) * 100).toFixed(1)) : null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Recipes & food cost"
        description="What each dish uses, what it costs to make, and how much of the price that eats."
      />

      {!kitchenStore ? (
        <div className="mb-5">
          <Alert tone="warning" title="No kitchen store is set">
            Recipes deduct ingredients from the location marked as the recipe source. Mark one on the{' '}
            <a href="/dashboard/inventory/warehouses" className="underline">
              warehouses page
            </a>{' '}
            or nothing will be consumed automatically.
          </Alert>
        </div>
      ) : null}

      <RecipesManager
        recipes={serialize(rows)}
        variants={variants.map((v) => ({
          id: v.id,
          label: `${v.menuItem.name} — ${v.name}`,
          price: Number(v.price),
          hasRecipe: Boolean(v.recipe),
        }))}
        ingredients={ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit.code,
          unitCost: Number(i.avgUnitCost),
        }))}
        currency={toPublicSettings(settings)}
        consumptionStore={kitchenStore?.name ?? null}
        canManage={session.user.permissions.has(PERMISSIONS.RECIPE_MANAGE)}
      />
    </div>
  );
}
