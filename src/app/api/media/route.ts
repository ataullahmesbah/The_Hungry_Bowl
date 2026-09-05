import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { MEDIA_FOLDERS, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '@/lib/cloudinary/config';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  folder: z.string().max(60).optional(),
  type: z.enum(['IMAGE', 'VIDEO', 'RAW']).optional(),
  search: z.string().max(120).optional(),
});

export const GET = route(
  { permission: PERMISSIONS.MEDIA_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where = {
      deletedAt: null,
      ...(query.folder ? { folder: { contains: query.folder } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { altText: { contains: query.search, mode: 'insensitive' as const } },
              { publicId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        select: {
          id: true,
          publicId: true,
          secureUrl: true,
          type: true,
          format: true,
          width: true,
          height: true,
          bytes: true,
          folder: true,
          title: true,
          altText: true,
          caption: true,
          usageCount: true,
          createdAt: true,
        },
      }),
      prisma.mediaAsset.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

/**
 * Registers an asset the browser has just uploaded to Cloudinary.
 *
 * Values are re-validated here rather than trusted: a caller could otherwise
 * point a record at an arbitrary URL and have the site render it.
 */
const registerSchema = z.object({
  publicId: z.string().min(1).max(300),
  url: z.string().url(),
  secureUrl: z.string().url(),
  type: z.enum(['IMAGE', 'VIDEO', 'RAW']).default('IMAGE'),
  format: z.string().max(20).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  bytes: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  folder: z.enum(MEDIA_FOLDERS).default('misc'),
  title: z.string().max(160).optional(),
  altText: z.string().max(300).optional(),
  caption: z.string().max(500).optional(),
});

export const POST = route(
  { permission: PERMISSIONS.MEDIA_UPLOAD, bodySchema: registerSchema },
  async ({ body, session }) => {
    if (!body.secureUrl.startsWith('https://res.cloudinary.com/')) {
      throw new HttpError(422, 'Media must be hosted on Cloudinary', 'invalid_media_host');
    }

    const limit = body.type === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (body.bytes && body.bytes > limit) {
      throw new HttpError(
        413,
        `That file is larger than the ${Math.round(limit / 1024 / 1024)} MB limit for this media type.`,
        'file_too_large',
      );
    }

    const asset = await prisma.mediaAsset.upsert({
      where: { publicId: body.publicId },
      create: { ...body, uploadedById: session!.user.id },
      update: { ...body, deletedAt: null },
    });

    await audit({
      session,
      action: 'media.upload',
      entity: 'MediaAsset',
      entityId: asset.id,
      after: { publicId: asset.publicId, folder: asset.folder },
    });

    return apiSuccess(asset, { status: 201 });
  },
);
