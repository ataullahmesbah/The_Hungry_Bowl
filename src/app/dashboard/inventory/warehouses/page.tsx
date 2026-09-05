import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { PageHeader } from '@/components/ui/primitives';
import { WarehousesManager } from './warehouses-manager';

export const metadata = { title: 'Warehouses' };
export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const session = await requirePagePermission(PERMISSIONS.INVENTORY_VIEW, '/dashboard/inventory/warehouses');

  const warehouses = await prisma.warehouse.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    include: { balances: { select: { quantity: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Warehouses & stores"
        description="Where stock lives. The kitchen store is where recipes deduct from."
      />
      <WarehousesManager
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          kind: w.kind,
          location: w.location,
          isActive: w.isActive,
          isDefaultReceiving: w.isDefaultReceiving,
          isDefaultConsumption: w.isDefaultConsumption,
          lineCount: w.balances.filter((b) => Number(b.quantity) !== 0).length,
        }))}
        canManage={session.user.permissions.has(PERMISSIONS.INVENTORY_MANAGE)}
      />
    </div>
  );
}
