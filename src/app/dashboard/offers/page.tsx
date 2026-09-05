import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { OffersManager } from './offers-manager';

export const metadata = { title: 'Offers' };
export const dynamic = 'force-dynamic';

export default async function OffersDashboardPage() {
  const session = await requirePagePermission(PERMISSIONS.WEBSITE_VIEW, '/dashboard/offers');
  const settings = await getSettings();

  const offers = await prisma.offer.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <div>
      <PageHeader
        title="Offers & promotions"
        description="Anything running right now, shown on the home page and the offers page."
      />
      <OffersManager
        offers={serialize(offers)}
        currency={toPublicSettings(settings)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManage={session.user.permissions.has(PERMISSIONS.WEBSITE_MANAGE)}
      />
    </div>
  );
}
