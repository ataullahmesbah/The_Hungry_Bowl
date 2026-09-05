import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { galleryItemSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.WEBSITE_VIEW }, async () => {
  const items = await prisma.galleryItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { media: true, album: { select: { id: true, name: true } } },
  });
  return apiSuccess(items);
});

export const POST = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: galleryItemSchema },
  async ({ body, session }) => {
    const last = await prisma.galleryItem.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    let order = (last?.sortOrder ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const mediaId of body.mediaIds) {
        rows.push(
          await tx.galleryItem.create({
            data: { mediaId, albumId: body.albumId ?? null, sortOrder: order++ },
          }),
        );
      }
      await tx.mediaAsset.updateMany({ where: { id: { in: body.mediaIds } }, data: { usageCount: { increment: 1 } } });
      return rows;
    });

    await audit({ session, action: 'cms.gallery_added', entity: 'GalleryItem', after: { count: created.length } });
    return apiSuccess(created, { status: 201 });
  },
);
