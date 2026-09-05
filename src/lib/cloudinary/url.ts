/**
 * Cloudinary delivery URLs, built on the client without the SDK.
 *
 * Cloudinary does the resizing and format negotiation, so the browser
 * downloads a 40 KB WebP instead of the 4 MB original the owner uploaded.
 */
export interface TransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'thumb' | 'scale';
  gravity?: 'auto' | 'face' | 'center';
  quality?: 'auto' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  blur?: number;
}

export function cldUrl(secureUrl: string | null | undefined, options: TransformOptions = {}): string {
  if (!secureUrl) return '';
  if (!secureUrl.includes('/upload/')) return secureUrl;

  const parts: string[] = [];
  if (options.width) parts.push(`w_${options.width}`);
  if (options.height) parts.push(`h_${options.height}`);
  parts.push(`c_${options.crop ?? 'fill'}`);
  if (options.gravity) parts.push(`g_${options.gravity}`);
  parts.push(`q_${options.quality ?? 'auto'}`);
  parts.push(`f_${options.format ?? 'auto'}`);
  if (options.blur) parts.push(`e_blur:${options.blur}`);

  return secureUrl.replace('/upload/', `/upload/${parts.join(',')}/`);
}

/** srcset covering the widths a responsive card actually renders at. */
export function cldSrcSet(secureUrl: string | null | undefined, widths = [320, 480, 640, 960, 1280, 1920]): string {
  if (!secureUrl) return '';
  return widths.map((w) => `${cldUrl(secureUrl, { width: w })} ${w}w`).join(', ');
}

/** Tiny blurred version used as a placeholder while the real image loads. */
export function cldPlaceholder(secureUrl: string | null | undefined): string {
  return cldUrl(secureUrl, { width: 24, quality: 30, blur: 400 });
}
