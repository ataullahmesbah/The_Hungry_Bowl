import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { MenuItemForm, EMPTY_ITEM } from '../menu-item-form';

export const metadata = { title: 'New menu item' };
export const dynamic = 'force-dynamic';

export default async function NewMenuItemPage() {
  await requirePagePermission(PERMISSIONS.MENU_MANAGE, '/dashboard/menu/new');
  const settings = await getSettings();

  const [categories, groups] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { deletedAt: null, status: { not: 'ARCHIVED' } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.addOnGroup.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        selectionType: true,
        addOns: { orderBy: { sortOrder: 'asc' }, select: { name: true, price: true } },
      },
    }),
  ]);

  if (categories.length === 0) redirect('/dashboard/menu/categories?first=1');

  return (
    <div>
      <PageHeader title="New menu item" description="Add one dish. Sizes and add-ons go inside this record." />
      <div className="mb-5">
        <Alert tone="info" title="One dish, one record">
          If this dish comes in Regular, Medium and Large, add three sizes below — do not create three separate menu
          items.
        </Alert>
      </div>
      <MenuItemForm
        initial={{ ...EMPTY_ITEM, categoryId: categories[0]!.id }}
        categories={categories}
        addOnGroups={groups.map((g) => ({ ...g, addOns: g.addOns.map((a) => ({ name: a.name, price: Number(a.price) })) }))}
        currency={toPublicSettings(settings)}
      />
    </div>
  );
}
