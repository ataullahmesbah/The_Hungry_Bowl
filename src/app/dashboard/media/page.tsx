import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { isCloudinaryConfigured } from '@/lib/env';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { MediaLibrary } from './media-library';

export const metadata = { title: 'Media library' };
export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const session = await requirePagePermission(PERMISSIONS.MEDIA_VIEW, '/dashboard/media');

  const [assets, folderCounts] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 120,
    }),
    prisma.mediaAsset.groupBy({ by: ['folder'], where: { deletedAt: null }, _count: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Every photo and video used on the website. Uploads go straight to Cloudinary and are delivered in the right size automatically."
      />

      {!isCloudinaryConfigured ? (
        <div className="mb-5">
          <Alert tone="warning" title="Cloudinary is not connected yet">
            Add <code className="font-mono text-xs">CLOUDINARY_CLOUD_NAME</code>,{' '}
            <code className="font-mono text-xs">CLOUDINARY_API_KEY</code> and{' '}
            <code className="font-mono text-xs">CLOUDINARY_API_SECRET</code> to your environment variables, then
            redeploy. Until then, uploads will not work.
          </Alert>
        </div>
      ) : null}

      <MediaLibrary
        initialAssets={serialize(assets)}
        folders={folderCounts.map((f) => ({ folder: f.folder, count: f._count }))}
        canUpload={session.user.permissions.has(PERMISSIONS.MEDIA_UPLOAD)}
        canDelete={session.user.permissions.has(PERMISSIONS.MEDIA_DELETE)}
      />
    </div>
  );
}
