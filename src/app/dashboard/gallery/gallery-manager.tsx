'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import type { UploadedAsset } from '@/components/media/use-upload';
import { ApiError, api } from '@/lib/client/api-client';
import { cldUrl } from '@/lib/cloudinary/url';

interface GalleryRow {
  id: string;
  title: string | null;
  caption: string | null;
  isPublished: boolean;
  sortOrder: number;
  media: {
    id: string;
    publicId: string;
    secureUrl: string;
    altText: string | null;
    title: string | null;
    type: 'IMAGE' | 'VIDEO' | 'RAW';
    width: number | null;
    height: number | null;
  };
}

export function GalleryManager({ items, canManage }: { items: GalleryRow[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [staged, setStaged] = useState<UploadedAsset[]>([]);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<GalleryRow | null>(null);

  async function addStaged() {
    if (staged.length === 0) return;
    setPending(true);
    try {
      await api.post('/api/cms/gallery', { mediaIds: staged.map((a) => a.id) });
      toast.success(`${staged.length} photo${staged.length === 1 ? '' : 's'} added to the gallery`);
      setStaged([]);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add to the gallery');
    } finally {
      setPending(false);
    }
  }

  async function togglePublished(item: GalleryRow) {
    try {
      await api.patch(`/api/cms/gallery/${item.id}`, { isPublished: !item.isPublished });
      router.refresh();
    } catch {
      toast.error('Could not update');
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/cms/gallery/${toDelete.id}`);
      toast.success('Removed from the gallery');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <Card>
          <CardBody className="space-y-3">
            <MediaPicker
              slotKey="gallery"
              label="Add photos"
              multiple
              values={staged}
              onChangeMultiple={setStaged}
            />
            {staged.length > 0 ? (
              <Button onClick={() => void addStaged()} disabled={pending}>
                Add {staged.length} photo{staged.length === 1 ? '' : 's'} to the gallery
              </Button>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        {items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-espresso-400">
            The gallery is empty. Add a few photos of the room and the food.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded-lg border border-espresso-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cldUrl(item.media.secureUrl, { width: 300, height: 300 })}
                  alt={item.media.altText ?? ''}
                  className="aspect-square w-full bg-cream-100 object-cover"
                  loading="lazy"
                />
                {!item.isPublished ? (
                  <span className="absolute left-2 top-2">
                    <Badge tone="warning">hidden</Badge>
                  </span>
                ) : null}
                {canManage ? (
                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-espresso-950/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => void togglePublished(item)}
                      className="rounded bg-white/90 p-1.5 text-espresso-700 hover:bg-white"
                      aria-label={item.isPublished ? 'Hide from the website' : 'Show on the website'}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(item)}
                      className="rounded bg-white/90 p-1.5 text-chilli-600 hover:bg-white"
                      aria-label="Remove from the gallery"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Remove this photo from the gallery?"
        confirmLabel="Remove"
        pending={pending}
        description="The photo stays in your media library — this only takes it off the gallery page."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
