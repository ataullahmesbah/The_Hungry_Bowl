import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { destroyAsset } from '@/lib/cloudinary/server';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const patchSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  altText: z.string().max(300).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
});

export const PATCH = route(
  { permission: PERMISSIONS.MEDIA_UPLOAD, bodySchema: patchSchema },
  async ({ body, params, session }) => {
    const before = await prisma.mediaAsset.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Media not found', 'not_found');

    const asset = await prisma.mediaAsset.update({ where: { id: params.id }, data: body });

    await audit({
      session,
      action: 'media.update',
      entity: 'MediaAsset',
      entityId: asset.id,
      before: { title: before.title, altText: before.altText },
      after: { title: asset.title, altText: asset.altText },
    });

    return apiSuccess(asset);
  },
);

const deleteQuery = z.object({ force: z.enum(['true', 'false']).default('false') });

/**
 * Deleting media still referenced by published content is refused unless the
 * caller explicitly confirms — PRD §16 asks for exactly this guard.
 */
export const DELETE = route(
  { permission: PERMISSIONS.MEDIA_DELETE, querySchema: deleteQuery },
  async ({ params, query, session }) => {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: params.id },
      include: { _count: { select: { menuItemMedia: true, galleryItems: true } } },
    });
    if (!asset || asset.deletedAt) throw new HttpError(404, 'Media not found', 'not_found');

    const references = asset._count.menuItemMedia + asset._count.galleryItems;
    if (references > 0 && query.force !== 'true') {
      throw new HttpError(
        409,
        `This file is still used in ${references} place${references === 1 ? '' : 's'} on the website. Remove it there first, or confirm to delete it anyway.`,
        'media_in_use',
        { references },
      );
    }

    await destroyAsset(
      asset.publicId,
      asset.type === 'VIDEO' ? 'video' : asset.type === 'RAW' ? 'raw' : 'image',
    );

    // Soft delete keeps the audit trail meaningful even after the file is gone.
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });

    await audit({
      session,
      action: 'media.delete',
      entity: 'MediaAsset',
      entityId: asset.id,
      severity: 'MEDIUM',
      before: { publicId: asset.publicId, references },
    });

    return apiSuccess({ deleted: true });
  },
);
