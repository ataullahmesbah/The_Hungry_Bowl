import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const patchSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isPublished: z.boolean().optional(),
});

export const PATCH = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: patchSchema },
  async ({ body, params }) => {
    const item = await prisma.galleryItem.findUnique({ where: { id: params.id } });
    if (!item) throw new HttpError(404, 'Gallery item not found', 'not_found');
    return apiSuccess(await prisma.galleryItem.update({ where: { id: params.id }, data: body }));
  },
);

export const DELETE = route({ permission: PERMISSIONS.WEBSITE_MANAGE }, async ({ params, session }) => {
  const item = await prisma.galleryItem.findUnique({ where: { id: params.id } });
  if (!item) throw new HttpError(404, 'Gallery item not found', 'not_found');

  await prisma.$transaction([
    prisma.galleryItem.delete({ where: { id: params.id } }),
    prisma.mediaAsset.update({ where: { id: item.mediaId }, data: { usageCount: { decrement: 1 } } }),
  ]);

  await audit({ session, action: 'cms.gallery_removed', entity: 'GalleryItem', entityId: params.id });
  return apiSuccess({ removed: true });
});
