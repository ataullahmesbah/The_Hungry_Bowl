import type { Metadata } from 'next';
import { Images } from 'lucide-react';
import { getGallery } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { CldImage } from '@/components/public/cld-image';

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    path: '/gallery',
    fallbackTitle: 'Gallery',
    fallbackDescription: 'Photographs of the restaurant, the kitchen and the food.',
  });
}

export default async function GalleryPage() {
  const photos = await getGallery();

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Gallery
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">A look at the room, the kitchen and what comes out of it.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {photos.length === 0 ? (
          <div className="py-20 text-center">
            <Images className="mx-auto h-10 w-10 text-espresso-200" />
            <p className="mt-3 text-espresso-400">Photos are on the way.</p>
          </div>
        ) : (
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {photos.map((photo) => (
              <figure key={photo.id} className="mb-4 break-inside-avoid">
                <CldImage
                  src={photo.media.secureUrl}
                  alt={photo.media.altText || photo.title || 'Restaurant photo'}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                />
                {photo.caption ? (
                  <figcaption className="mt-1.5 text-xs text-espresso-400">{photo.caption}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
