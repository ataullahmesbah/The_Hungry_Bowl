import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { PageHeader } from '@/components/ui/primitives';
import { GalleryManager } from './gallery-manager';

export const metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

export default async function GalleryDashboard() {
  const session = await requirePagePermission(PERMISSIONS.WEBSITE_VIEW, '/dashboard/gallery');

  const items = await prisma.galleryItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { media: { select: { id: true, secureUrl: true, altText: true, title: true, type: true, publicId: true, width: true, height: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Gallery"
        description="Photos shown on the gallery page and in the strip on the home page."
      />
      <GalleryManager
        items={serialize(items)}
        canManage={session.user.permissions.has(PERMISSIONS.WEBSITE_MANAGE)}
      />
    </div>
  );
}
