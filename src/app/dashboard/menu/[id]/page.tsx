import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui/primitives';
import { MenuItemForm, type MenuItemFormValues } from '../menu-item-form';

export const metadata = { title: 'Edit menu item' };
export const dynamic = 'force-dynamic';

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePagePermission(PERMISSIONS.MENU_MANAGE, `/dashboard/menu/${id}`);
  const settings = await getSettings();

  const [item, categories, groups, availabilityLog] = await Promise.all([
    prisma.menuItem.findUnique({
      where: { id },
      include: {
        variants: { orderBy: { sortOrder: 'asc' } },
        addOnGroups: { select: { groupId: true } },
        media: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
      },
    }),
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
    prisma.menuAvailabilityLog.findMany({
      where: { menuItemId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  if (!item || item.deletedAt) notFound();

  const initial: MenuItemFormValues = {
    name: item.name,
    slug: item.slug,
    categoryId: item.categoryId,
    shortDescription: item.shortDescription ?? '',
    description: item.description ?? '',
    status: item.status,
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    isTodaysSpecial: item.isTodaysSpecial,
    isNew: item.isNew,
    priceDisplayMode: item.priceDisplayMode,
    basePrice: item.basePrice != null ? String(Number(item.basePrice)) : '',
    isVegetarian: item.isVegetarian,
    isVegan: item.isVegan,
    isHalal: item.isHalal,
    spiceLevel: item.spiceLevel,
    allergens: item.allergens.join(', '),
    calories: item.calories != null ? String(item.calories) : '',
    prepMinutes: item.prepMinutes != null ? String(item.prepMinutes) : '',
    sortOrder: String(item.sortOrder),
    metaTitle: item.metaTitle ?? '',
    metaDescription: item.metaDescription ?? '',
    metaKeywords: item.metaKeywords ?? '',
    variants: item.variants.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code ?? '',
      price: String(Number(v.price)),
      portionLabel: v.portionLabel ?? '',
      isAvailable: v.isAvailable,
      isDefault: v.isDefault,
    })),
    addOnGroupIds: item.addOnGroups.map((g) => g.groupId),
    media: item.media.map((m) => ({
      id: m.media.id,
      publicId: m.media.publicId,
      secureUrl: m.media.secureUrl,
      type: m.media.type,
      width: m.media.width,
      height: m.media.height,
      altText: m.media.altText,
      title: m.media.title,
    })),
  };

  return (
    <div>
      <PageHeader
        title={item.name}
        description={`Last updated ${formatDateTime(item.updatedAt, settings.timezone, settings.locale)}`}
        actions={
          <Link href="/dashboard/menu" className="text-sm text-espresso-500 hover:text-espresso-800">
            ← Back to menu
          </Link>
        }
      />

      <MenuItemForm
        itemId={item.id}
        initial={initial}
        categories={categories}
        addOnGroups={groups.map((g) => ({ ...g, addOns: g.addOns.map((a) => ({ name: a.name, price: Number(a.price) })) }))}
        currency={toPublicSettings(settings)}
      />

      {availabilityLog.length > 0 ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Availability history</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2.5">
              {availabilityLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <Badge tone={entry.isAvailable ? 'success' : 'danger'}>
                    {entry.isAvailable ? 'On' : 'Off'}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-espresso-700">{entry.reason ?? 'No reason recorded'}</p>
                    <p className="text-xs text-espresso-400">
                      {formatDateTime(entry.createdAt, settings.timezone, settings.locale)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
