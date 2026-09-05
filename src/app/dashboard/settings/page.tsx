import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { serialize } from '@/lib/db';
import { PageHeader } from '@/components/ui/primitives';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePagePermission(PERMISSIONS.SETTINGS_VIEW, '/dashboard/settings');
  const settings = await getSettings();

  return (
    <div>
      <PageHeader
        title="Restaurant settings"
        description="Your details, where you are, and how money and time are handled."
      />
      <SettingsForm
        settings={{
          ...serialize(settings),
          // Prisma types Json as a broad union; the form only ever deals with
          // the opening-hours shape it writes.
          openingHours: (settings.openingHours as unknown as
            | { day: number; open: string; close: string; closed: boolean }[]
            | null) ?? null,
        }}
        canManage={session.user.permissions.has(PERMISSIONS.SETTINGS_MANAGE)}
      />
    </div>
  );
}
