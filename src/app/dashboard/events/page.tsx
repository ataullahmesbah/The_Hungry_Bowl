import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { EventsManager } from './events-manager';

export const metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function EventsDashboardPage() {
  const session = await requirePagePermission(PERMISSIONS.WEBSITE_VIEW, '/dashboard/events');
  const settings = await getSettings();

  const events = await prisma.event.findMany({ where: { deletedAt: null }, orderBy: { startsAt: 'desc' } });

  return (
    <div>
      <PageHeader title="Events" description="Special evenings and programmes shown on the website." />
      <EventsManager
        events={serialize(events)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManage={session.user.permissions.has(PERMISSIONS.WEBSITE_MANAGE)}
      />
    </div>
  );
}
