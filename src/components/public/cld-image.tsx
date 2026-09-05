import { cldPlaceholder, cldSrcSet, cldUrl } from '@/lib/cloudinary/url';
import { cn } from '@/lib/utils';

/**
 * Plain <img> with Cloudinary transformations rather than next/image.
 *
 * Cloudinary already does resizing, format negotiation and CDN delivery, so
 * routing the same work through Next's optimiser would add a second hop and,
 * on Vercel, a per-image billing line for no benefit.
 */
export function CldImage({
  src,
  alt,
  width,
  height,
  sizes = '100vw',
  className,
  imgClassName,
  priority = false,
  aspect,
  rounded = true,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  aspect?: string;
  rounded?: boolean;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-cream-200 text-espresso-300',
          rounded && 'rounded-lg',
          className,
        )}
        style={aspect ? { aspectRatio: aspect } : undefined}
        aria-hidden
      >
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25v13.5A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75V5.25z" />
          <path d="M3 16l5-5 4 4 3-3 6 6" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={cn('overflow-hidden bg-cream-200', rounded && 'rounded-lg', className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cldUrl(src, { width: width ?? 1200, height })}
        srcSet={cldSrcSet(src)}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={cn('h-full w-full object-cover', imgClassName)}
        style={{
          backgroundImage: `url(${cldPlaceholder(src)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    </div>
  );
}
