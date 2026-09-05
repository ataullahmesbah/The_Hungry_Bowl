import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { ReportsBoard } from './reports-board';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await requirePagePermission(
    [PERMISSIONS.REPORT_SALES, PERMISSIONS.REPORT_FINANCE, PERMISSIONS.REPORT_INVENTORY],
    '/dashboard/reports',
  );
  const settings = await getSettings();

  return (
    <div>
      <PageHeader title="Reports" description="Sales, profit and stock value, over any period you choose." />
      <ReportsBoard
        currency={toPublicSettings(settings)}
        taxLabel={settings.taxLabel}
        can={{
          sales: session.user.permissions.has(PERMISSIONS.REPORT_SALES),
          finance: session.user.permissions.has(PERMISSIONS.REPORT_FINANCE),
          inventory: session.user.permissions.has(PERMISSIONS.REPORT_INVENTORY),
        }}
      />
    </div>
  );
}
