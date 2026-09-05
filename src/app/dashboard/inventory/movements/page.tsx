import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader, Card } from '@/components/ui/primitives';
import { MovementsTable } from './movements-table';

export const metadata = { title: 'Stock movements' };
export const dynamic = 'force-dynamic';

export default async function MovementsPage() {
  await requirePagePermission(PERMISSIONS.INVENTORY_VIEW, '/dashboard/inventory/movements');
  const settings = await getSettings();

  const movements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 250,
    include: {
      item: { select: { id: true, name: true, unit: { select: { code: true } } } },
      fromWarehouse: { select: { id: true, name: true } },
      toWarehouse: { select: { id: true, name: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Stock movements"
        description="Every change to stock, in order. Balances are derived from this ledger, never edited directly."
      />
      <Card>
        <MovementsTable
          movements={serialize(movements)}
          currency={toPublicSettings(settings)}
          timezone={settings.timezone}
          locale={settings.locale}
        />
      </Card>
    </div>
  );
}
