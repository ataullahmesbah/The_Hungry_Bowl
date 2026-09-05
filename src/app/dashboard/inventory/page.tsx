import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { InventoryBoard } from './inventory-board';

export const metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.INVENTORY_VIEW, '/dashboard/inventory');
  const params = await searchParams;
  const settings = await getSettings();

  const [items, warehouses, units, categories] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      take: 300,
      include: {
        unit: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
        balances: { select: { quantity: true, warehouse: { select: { id: true, name: true, kind: true } } } },
      },
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    prisma.inventoryCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const perms = session.user.permissions;

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="What is in the store and the kitchen right now, and every movement between them."
      />
      <InventoryBoard
        items={serialize(items)}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, kind: w.kind }))}
        units={units.map((u) => ({ id: u.id, code: u.code, name: u.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        currency={toPublicSettings(settings)}
        initialFilter={params.filter ?? ''}
        can={{
          manage: perms.has(PERMISSIONS.INVENTORY_MANAGE),
          transfer: perms.has(PERMISSIONS.INVENTORY_TRANSFER),
          adjust: perms.has(PERMISSIONS.INVENTORY_ADJUST),
          wastage: perms.has(PERMISSIONS.INVENTORY_WASTAGE),
        }}
      />
    </div>
  );
}
