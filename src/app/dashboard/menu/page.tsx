import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { serialize } from '@/lib/db';
import { PageHeader, Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { MenuItemsTable } from './items-table';

export const metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.MENU_VIEW, '/dashboard/menu');
  const params = await searchParams;
  const settings = await getSettings();

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        ...(params.category ? { categoryId: params.category } : {}),
        ...(params.status ? { status: params.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' } : {}),
        ...(params.q
          ? { OR: [{ name: { contains: params.q, mode: 'insensitive' as const } }, { slug: { contains: params.q, mode: 'insensitive' as const } }] }
          : {}),
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 300,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isAvailable: true,
        unavailableReason: true,
        isFeatured: true,
        isTodaysSpecial: true,
        priceDisplayMode: true,
        basePrice: true,
        category: { select: { id: true, name: true } },
        variants: { select: { id: true, name: true, price: true, isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        media: { take: 1, orderBy: { sortOrder: 'asc' }, select: { media: { select: { secureUrl: true } } } },
      },
    }),
    prisma.menuCategory.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const canManage = session.user.permissions.has(PERMISSIONS.MENU_MANAGE);
  const canToggle = session.user.permissions.has(PERMISSIONS.MENU_TOGGLE_AVAILABILITY);
  const canReport = session.user.permissions.has(PERMISSIONS.MENU_REPORT_STOCKOUT);

  return (
    <div>
      <PageHeader
        title="Menu items"
        description="One record per dish. Sizes and add-ons live inside the item — never create a separate card for each size."
        actions={
          canManage ? (
            <Link href="/dashboard/menu/new">
              <Button>
                <Plus className="h-4 w-4" />
                New item
              </Button>
            </Link>
          ) : null
        }
      />

      <Card>
        <MenuItemsTable
          items={serialize(items)}
          categories={categories}
          currency={toPublicSettings(settings)}
          canManage={canManage}
          canToggle={canToggle}
          canReport={canReport}
          initialFilters={{ q: params.q ?? '', category: params.category ?? '', status: params.status ?? '' }}
        />
      </Card>
    </div>
  );
}
