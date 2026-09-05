import { z } from 'zod';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { createUploadSignature, fullFolder, isCloudinaryConfigured } from '@/lib/cloudinary/server';
import { MEDIA_FOLDERS } from '@/lib/cloudinary/config';
import { HttpError } from '@/lib/auth/guard';

const bodySchema = z.object({
  folder: z.enum(MEDIA_FOLDERS).default('misc'),
  /** Optional sub-folder, e.g. a menu item slug. */
  subFolder: z
    .string()
    .max(60)
    .regex(/^[a-z0-9-]*$/i, 'Only letters, numbers and dashes')
    .optional(),
});

/**
 * Hands the browser a short-lived signature so it can upload straight to
 * Cloudinary. The API secret never leaves the server.
 */
export const POST = route(
  {
    permission: PERMISSIONS.MEDIA_UPLOAD,
    bodySchema,
    rateLimit: { bucket: 'media-signature', ...RATE_LIMITS.upload },
  },
  async ({ body }) => {
    if (!isCloudinaryConfigured) {
      throw new HttpError(
        503,
        'Media uploads are not configured yet. Add your Cloudinary keys in the environment settings.',
        'cloudinary_not_configured',
      );
    }

    const folder = fullFolder(body.subFolder ? `${body.folder}/${body.subFolder}` : body.folder);
    return apiSuccess(createUploadSignature({ folder, tags: ['the-hungry-bowl'] }));
  },
);
