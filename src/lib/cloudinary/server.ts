import 'server-only';
import { v2 as cloudinary } from 'cloudinary';
import { env, isCloudinaryConfigured } from '@/lib/env';

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export { cloudinary, isCloudinaryConfigured };

/**
 * Signed direct-to-Cloudinary upload.
 *
 * The browser uploads the file straight to Cloudinary using this signature, so
 * the file never passes through our server. That keeps us under Vercel's
 * request body limit and works identically on a VPS. The API secret stays on
 * the server: only a short-lived signature crosses the wire.
 */
export function createUploadSignature(params: { folder: string; publicId?: string; tags?: string[] }) {
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const toSign: Record<string, string | number> = {
    folder: params.folder,
    timestamp,
  };
  if (params.publicId) toSign.public_id = params.publicId;
  if (params.tags?.length) toSign.tags = params.tags.join(',');

  const signature = cloudinary.utils.api_sign_request(toSign, env.CLOUDINARY_API_SECRET!);

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    folder: params.folder,
    ...(params.publicId ? { publicId: params.publicId } : {}),
    ...(params.tags?.length ? { tags: params.tags.join(',') } : {}),
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
  };
}

export async function destroyAsset(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
  if (!isCloudinaryConfigured) return { result: 'skipped' };
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
}

/** Build the full folder path, always namespaced under the configured root. */
export function fullFolder(folder: string): string {
  const clean = folder.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9/_-]/g, '');
  const root = env.CLOUDINARY_ROOT_FOLDER || 'the-hungry-bowl';
  return clean ? `${root}/${clean}` : root;
}
