import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { PurchaseForm } from './purchase-form';

export const metadata = { title: 'Record a purchase' };
export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  await requirePagePermission(PERMISSIONS.PURCHASE_MANAGE, '/dashboard/purchases/new');
  const settings = await getSettings();

  const [items, suppliers, warehouses] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lastPurchasePrice: true,
        avgUnitCost: true,
        unit: { select: { code: true } },
      },
    }),
    prisma.supplier.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, isDefaultReceiving: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Record a purchase"
        description="Enter what arrived and what it cost. Receiving it moves the stock and updates the average cost."
      />
      <PurchaseForm
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit.code,
          lastPrice: i.lastPurchasePrice != null ? Number(i.lastPurchasePrice) : Number(i.avgUnitCost),
        }))}
        suppliers={suppliers}
        warehouses={warehouses}
        currency={toPublicSettings(settings)}
      />
    </div>
  );
}
