import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { businessDateKey } from '@/lib/service/orders';
import { businessDayRange } from '@/lib/service/reconciliation';
import { stockLedger } from '@/lib/service/stock-ledger';
import { PageHeader } from '@/components/ui/primitives';
import { LedgerScreen } from './ledger-screen';

export const metadata = { title: 'Stock ledger' };
export const dynamic = 'force-dynamic';

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; warehouseId?: string }>;
}) {
  await requirePagePermission(PERMISSIONS.INVENTORY_VIEW, '/dashboard/inventory/ledger');

  const params = await searchParams;
  const settings = await getSettings();

  // Default to today in the restaurant's own timezone, not the server's.
  const today = businessDateKey(settings.timezone);
  const fromKey = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : today;
  const toKey = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : fromKey;

  const start = businessDayRange(fromKey, settings.timezone).from;
  const end = businessDayRange(toKey, settings.timezone).to;
  const range = start <= end ? { from: start, to: end } : { from: end, to: start };

  const [warehouses, locations] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }], select: { id: true, name: true, kind: true } }),
    stockLedger(range, { warehouseId: params.warehouseId || null }),
  ]);

  return (
    <div>
      <PageHeader
        title="Stock ledger"
        description="Opening, in, out and closing for every item — each store counted on its own, for any date range."
      />
      <LedgerScreen
        locations={locations}
        warehouses={warehouses}
        from={fromKey}
        to={toKey}
        warehouseId={params.warehouseId ?? ''}
        currency={toPublicSettings(settings)}
      />
    </div>
  );
}
