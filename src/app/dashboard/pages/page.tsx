import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { PagesManager } from './pages-manager';

export const metadata = { title: 'Pages' };
export const dynamic = 'force-dynamic';

export default async function PagesDashboard() {
  const session = await requirePagePermission(PERMISSIONS.WEBSITE_VIEW, '/dashboard/pages');
  const settings = await getSettings();

  const pages = await prisma.page.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: 'desc' } });

  return (
    <div>
      <PageHeader
        title="Pages"
        description="About, policies and any extra pages you want on the website."
      />
      <PagesManager
        pages={serialize(pages)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManage={session.user.permissions.has(PERMISSIONS.WEBSITE_MANAGE)}
      />
    </div>
  );
}
