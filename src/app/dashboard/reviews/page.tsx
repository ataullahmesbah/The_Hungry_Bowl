import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { ReviewsModeration } from './reviews-moderation';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

export default async function ReviewsDashboard() {
  const session = await requirePagePermission(PERMISSIONS.WEBSITE_VIEW, '/dashboard/reviews');
  const settings = await getSettings();

  const reviews = await prisma.review.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Customer reviews"
        description="Approve what appears on the website and reply where it helps."
      />
      <ReviewsModeration
        reviews={serialize(reviews)}
        timezone={settings.timezone}
        locale={settings.locale}
        canModerate={session.user.permissions.has(PERMISSIONS.REVIEWS_MODERATE)}
      />
    </div>
  );
}
