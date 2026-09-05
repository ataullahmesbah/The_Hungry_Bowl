import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSeoGlobal, getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { SeoManager } from './seo-manager';

export const metadata = { title: 'SEO' };
export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  const session = await requirePagePermission(PERMISSIONS.SEO_VIEW, '/dashboard/seo');
  const [seo, settings, entries] = await Promise.all([
    getSeoGlobal(),
    getSettings(),
    prisma.seoEntry.findMany({ orderBy: { path: 'asc' } }),
  ]);

  const napComplete = Boolean(settings.addressLine1 && settings.city && settings.phone);

  return (
    <div>
      <PageHeader
        title="Search engine settings"
        description="How the website appears in Google, and what it tells search engines about the restaurant."
      />
      <SeoManager
        seo={serialize(seo)}
        entries={serialize(entries)}
        napComplete={napComplete}
        hasGeo={Boolean(settings.latitude && settings.longitude)}
        canManage={session.user.permissions.has(PERMISSIONS.SEO_MANAGE)}
      />
    </div>
  );
}
