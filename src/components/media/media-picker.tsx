'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Info, Search, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Alert, Badge, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/client/api-client';
import { cldUrl } from '@/lib/cloudinary/url';
import { slotByKey, type MediaSlot } from '@/lib/cloudinary/config';
import { cn } from '@/lib/utils';
import { useUpload, type UploadedAsset } from './use-upload';

interface MediaRow extends UploadedAsset {
  folder: string;
  bytes: number | null;
  usageCount: number;
}

/**
 * The one media control used by every form in the dashboard.
 *
 * It shows the recommended size for its slot, uploads straight to Cloudinary,
 * and lets an owner reuse an existing file instead of uploading duplicates.
 */
export function MediaPicker({
  slotKey,
  value,
  onChange,
  subFolder,
  label,
  multiple = false,
  values,
  onChangeMultiple,
}: {
  slotKey: string;
  label?: string;
  subFolder?: string;
  value?: string | null;
  onChange?: (secureUrl: string | null, asset: UploadedAsset | null) => void;
  multiple?: boolean;
  values?: UploadedAsset[];
  onChangeMultiple?: (assets: UploadedAsset[]) => void;
}) {
  const slot: MediaSlot = slotByKey(slotKey) ?? {
    key: slotKey,
    label: label ?? 'Image',
    folder: 'misc',
    recommended: '1200 × 1200 px',
    accept: 'image',
  };

  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, uploading, progress, error, setError } = useUpload(slot.folder, subFolder);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded: UploadedAsset[] = [];
    for (const file of Array.from(files).slice(0, multiple ? 10 : 1)) {
      const asset = await upload(file);
      if (asset) uploaded.push(asset);
    }
    if (uploaded.length === 0) return;
    if (multiple) onChangeMultiple?.([...(values ?? []), ...uploaded]);
    else onChange?.(uploaded[0]!.secureUrl, uploaded[0]!);
  }

  function pickFromLibrary(asset: MediaRow) {
    if (multiple) onChangeMultiple?.([...(values ?? []), asset]);
    else onChange?.(asset.secureUrl, asset);
    setOpen(false);
  }

  const accept =
    slot.accept === 'video' ? 'video/*' : slot.accept === 'both' ? 'image/*,video/*' : 'image/*';

  return (
    <div>
      {label ? <p className="mb-1.5 text-sm font-medium text-espresso-800">{label}</p> : null}

      <div className="rounded-lg border border-dashed border-espresso-200 bg-cream-50 p-3">
        {multiple ? (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(values ?? []).map((asset, index) => (
              <div key={asset.id} className="group relative overflow-hidden rounded-lg border border-espresso-100 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cldUrl(asset.secureUrl, { width: 240, height: 240 })}
                  alt={asset.altText ?? ''}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {index === 0 ? (
                  <span className="absolute left-1 top-1 rounded bg-saffron-500 px-1.5 py-0.5 text-[10px] font-semibold text-espresso-950">
                    Main
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChangeMultiple?.((values ?? []).filter((a) => a.id !== asset.id))}
                  className="absolute right-1 top-1 rounded bg-espresso-900/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : value ? (
          <div className="relative mb-3 overflow-hidden rounded-lg border border-espresso-100 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cldUrl(value, { width: 640 })}
              alt=""
              className="max-h-48 w-full object-cover"
              style={slot.aspect ? { aspectRatio: slot.aspect } : undefined}
            />
            <button
              type="button"
              onClick={() => onChange?.(null, null)}
              className="absolute right-2 top-2 rounded-lg bg-espresso-900/80 p-1.5 text-white hover:bg-chilli-600"
              aria-label="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Spinner /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? `Uploading ${progress}%` : 'Upload new'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={uploading}>
            <ImagePlus className="h-3.5 w-3.5" />
            Choose from library
          </Button>
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-espresso-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Recommended: <strong className="font-medium text-espresso-600">{slot.recommended}</strong>
            {slot.note ? <> — {slot.note}</> : null}
          </span>
        </p>

        {uploading ? (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-espresso-100">
            <div className="h-full bg-saffron-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {error ? (
          <div className="mt-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
      </div>

      {open ? <LibraryModal onClose={() => setOpen(false)} onPick={pickFromLibrary} folder={slot.folder} /> : null}
    </div>
  );
}

function LibraryModal({
  onClose,
  onPick,
  folder,
}: {
  onClose: () => void;
  onPick: (asset: MediaRow) => void;
  folder: string;
}) {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'slot' | 'all'>('slot');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '40' });
      if (scope === 'slot') params.set('folder', folder);
      if (search) params.set('search', search);
      const data = await api.get<{ items: MediaRow[] }>(`/api/media?${params}`);
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [folder, search, scope]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Media library"
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-espresso-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-espresso-900">Media library</h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-2.5">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or alt text"
              className="pl-8 text-xs"
            />
          </div>
          <div className="flex rounded-lg border border-espresso-200 p-0.5">
            {(['slot', 'all'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setScope(option)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium',
                  scope === option ? 'bg-espresso-900 text-cream-50' : 'text-espresso-500',
                )}
              >
                {option === 'slot' ? `“${folder}” folder` : 'All folders'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scroll-slim">
          {loading ? (
            <div className="flex justify-center py-12 text-espresso-400">
              <Spinner className="h-6 w-6" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-espresso-400">
              Nothing here yet. Use “Upload new” to add your first file.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onPick(asset)}
                  className="group relative overflow-hidden rounded-lg border border-espresso-100 text-left transition-shadow hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cldUrl(asset.secureUrl, { width: 240, height: 240 })}
                    alt={asset.altText ?? ''}
                    className="aspect-square w-full bg-cream-100 object-cover"
                    loading="lazy"
                  />
                  <div className="px-2 py-1.5">
                    <p className="truncate text-[11px] text-espresso-600">{asset.title ?? asset.publicId}</p>
                    {asset.usageCount > 0 ? (
                      <Badge tone="info" className="mt-1 text-[10px]">
                        in use
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
