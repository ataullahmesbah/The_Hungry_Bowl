import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { resolveRange } from '@/lib/service/reports';
import { PageHeader } from '@/components/ui/primitives';
import { AnalyticsBoard } from './analytics-board';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  await requirePagePermission(PERMISSIONS.REPORT_ANALYTICS, '/dashboard/analytics');
  const params = await searchParams;
  const settings = await getSettings();

  const preset = (params.preset as 'today' | 'week' | 'month' | 'year' | undefined) ?? 'month';
  void resolveRange(settings.timezone, { preset });

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="What sells, when you are busy, and where the money actually comes from."
      />
      <AnalyticsBoard initialPreset={preset} currency={toPublicSettings(settings)} />
    </div>
  );
}
