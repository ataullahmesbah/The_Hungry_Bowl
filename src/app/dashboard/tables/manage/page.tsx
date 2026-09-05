import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { PageHeader } from '@/components/ui/primitives';
import { TablesManager } from './tables-manager';

export const metadata = { title: 'Manage tables' };
export const dynamic = 'force-dynamic';

export default async function ManageTablesPage() {
  const auth = await requirePagePermission(PERMISSIONS.TABLE_VIEW, '/dashboard/tables/manage');

  const [areas, tables] = await Promise.all([
    prisma.tableArea.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.restaurantTable.findMany({
      where: { deletedAt: null },
      orderBy: [{ area: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        area: { select: { id: true, name: true } },
        // Whether a table is safe to remove: guests seated now, and whether it
        // carries history that a delete would orphan.
        sessions: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
        _count: { select: { sessions: true, orders: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Tables & areas"
        description="Add, rename or retire tables as the floor changes. History stays intact — a removed table keeps its past bills."
      />
      <TablesManager
        areas={serialize(areas).map((a) => ({
          id: a.id,
          name: a.name,
          floor: a.floor,
          sortOrder: a.sortOrder,
          isActive: a.isActive,
          tableCount: tables.filter((t) => t.areaId === a.id).length,
        }))}
        tables={tables.map((t) => ({
          id: t.id,
          name: t.name,
          areaId: t.areaId,
          areaName: t.area?.name ?? null,
          capacity: t.capacity,
          shape: t.shape,
          status: t.status,
          isActive: t.isActive,
          notes: t.notes,
          hasOpenSession: t.sessions.length > 0,
          sessionCount: t._count.sessions,
          orderCount: t._count.orders,
        }))}
        canManage={auth.user.permissions.has(PERMISSIONS.TABLE_MANAGE)}
      />
    </div>
  );
}
