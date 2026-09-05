import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { CategoriesManager } from './categories-manager';

export const metadata = { title: 'Menu categories' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.MENU_VIEW, '/dashboard/menu/categories');
  const params = await searchParams;

  const categories = await prisma.menuCategory.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });

  return (
    <div>
      <PageHeader
        title="Menu categories"
        description="Groups on the menu page, in the order customers see them."
      />
      {params.first ? (
        <div className="mb-5">
          <Alert tone="warning" title="Create a category first">
            Every dish belongs to a category. Add at least one before creating menu items.
          </Alert>
        </div>
      ) : null}
      <CategoriesManager
        categories={serialize(categories)}
        canManage={session.user.permissions.has(PERMISSIONS.MENU_MANAGE)}
        canDelete={session.user.permissions.has(PERMISSIONS.MENU_DELETE)}
      />
    </div>
  );
}
