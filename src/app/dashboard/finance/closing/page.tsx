import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { buildReconciliation, todayBusinessDate } from '@/lib/service/reconciliation';
import { PageHeader } from '@/components/ui/primitives';
import { ClosingScreen } from './closing-screen';

export const metadata = { title: 'Daily closing' };
export const dynamic = 'force-dynamic';

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.FINANCE_VIEW, '/dashboard/finance/closing');
  const params = await searchParams;
  const settings = await getSettings();

  const businessDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayBusinessDate(settings.timezone);

  const [report, saved, history] = await Promise.all([
    buildReconciliation(businessDate, settings.timezone),
    prisma.dailyClosing.findUnique({ where: { businessDate: new Date(`${businessDate}T00:00:00.000Z`) } }),
    prisma.dailyClosing.findMany({ orderBy: { businessDate: 'desc' }, take: 14 }),
  ]);

  return (
    <div>
      <PageHeader
        title="Daily closing"
        description="Count what is in the drawer, compare it with what the system recorded, and save the day."
      />
      <ClosingScreen
        businessDate={businessDate}
        report={report}
        saved={saved ? serialize(saved) : null}
        history={serialize(history)}
        currency={toPublicSettings(settings)}
        timezone={settings.timezone}
        locale={settings.locale}
        canClose={session.user.permissions.has(PERMISSIONS.FINANCE_CLOSE_DAY)}
      />
    </div>
  );
}
