'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Info, Search, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useUpload } from '@/components/media/use-upload';
import { ApiError, api } from '@/lib/client/api-client';
import { cldUrl } from '@/lib/cloudinary/url';
import { MEDIA_FOLDERS, MEDIA_SLOTS } from '@/lib/cloudinary/config';
import { formatDateTime } from '@/lib/format';

interface Asset {
  id: string;
  publicId: string;
  secureUrl: string;
  type: 'IMAGE' | 'VIDEO' | 'RAW';
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  folder: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  usageCount: number;
  createdAt: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaLibrary({
  initialAssets,
  folders,
  canUpload,
  canDelete,
}: {
  initialAssets: Asset[];
  folders: { folder: string; count: number }[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [uploadFolder, setUploadFolder] = useState<string>('menu');
  const [selected, setSelected] = useState<Asset | null>(null);
  const [toDelete, setToDelete] = useState<Asset | null>(null);
  const [pending, setPending] = useState(false);

  const { upload, uploading, progress, error } = useUpload(uploadFolder);

  const slotHint = MEDIA_SLOTS.find((s) => s.folder === uploadFolder);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (folderFilter && !asset.folder.includes(folderFilter)) return false;
      if (!q) return true;
      return (
        asset.title?.toLowerCase().includes(q) ||
        asset.altText?.toLowerCase().includes(q) ||
        asset.publicId.toLowerCase().includes(q)
      );
    });
  }, [assets, search, folderFilter]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const asset = await upload(file);
      if (asset) router.refresh();
    }
    toast.success('Upload finished');
  }

  async function saveDetails(asset: Asset, patch: { title: string; altText: string; caption: string }) {
    setPending(true);
    try {
      await api.patch(`/api/media/${asset.id}`, {
        title: patch.title || null,
        altText: patch.altText || null,
        caption: patch.caption || null,
      });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)));
      setSelected(null);
      toast.success('Details saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setPending(false);
    }
  }

  async function remove(force = false) {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/media/${toDelete.id}?force=${force}`);
      setAssets((prev) => prev.filter((a) => a.id !== toDelete.id));
      setToDelete(null);
      setSelected(null);
      toast.success('File deleted');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {canUpload ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Upload into folder" className="w-auto min-w-44">
              <Select value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)}>
                {MEDIA_FOLDERS.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </Select>
            </Field>

            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <Upload className="h-4 w-4" />}
              {uploading ? `Uploading ${progress}%` : 'Upload files'}
            </Button>
          </div>

          {slotHint ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-espresso-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                For <strong className="font-medium text-espresso-600">{slotHint.label}</strong>, upload{' '}
                <strong className="font-medium text-espresso-600">{slotHint.recommended}</strong>.
                {slotHint.note ? ` ${slotHint.note}` : ''}
              </span>
            </p>
          ) : null}

          {uploading ? (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-espresso-100">
              <div className="h-full bg-saffron-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}

          {error ? (
            <div className="mt-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search media" className="pl-8" />
          </div>
          <Select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className="w-auto" aria-label="Filter by folder">
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f.folder} value={f.folder}>
                {f.folder} ({f.count})
              </option>
            ))}
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-espresso-400">
            No media here yet. Upload your first photo above.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelected(asset)}
                className="group overflow-hidden rounded-lg border border-espresso-100 text-left transition-shadow hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cldUrl(asset.secureUrl, { width: 300, height: 300 })}
                  alt={asset.altText ?? ''}
                  className="aspect-square w-full bg-cream-100 object-cover"
                  loading="lazy"
                />
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-medium text-espresso-800">{asset.title ?? asset.publicId.split('/').pop()}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-espresso-400">
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.type}
                    {asset.usageCount > 0 ? <Badge tone="info" className="text-[10px]">in use</Badge> : null}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <AssetDetails
          asset={selected}
          canDelete={canDelete}
          pending={pending}
          onClose={() => setSelected(null)}
          onSave={(patch) => void saveDetails(selected, patch)}
          onDelete={() => setToDelete(selected)}
          onCopy={() => {
            void navigator.clipboard.writeText(selected.secureUrl);
            toast.success('Link copied');
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this file permanently?"
        confirmLabel="Delete"
        pending={pending}
        description={
          toDelete && toDelete.usageCount > 0
            ? `This file is used in ${toDelete.usageCount} place(s) on the website. Deleting it will leave a blank space there.`
            : 'The file is removed from Cloudinary and from the library. This cannot be undone.'
        }
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove(true)}
      />
    </div>
  );
}

function AssetDetails({
  asset,
  canDelete,
  pending,
  onClose,
  onSave,
  onDelete,
  onCopy,
}: {
  asset: Asset;
  canDelete: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: { title: string; altText: string; caption: string }) => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const [values, setValues] = useState({
    title: asset.title ?? '',
    altText: asset.altText ?? '',
    caption: asset.caption ?? '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Media details" className="relative grid max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl md:grid-cols-2">
        <div className="bg-cream-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cldUrl(asset.secureUrl, { width: 800 })}
            alt={asset.altText ?? ''}
            className="h-full max-h-[50vh] w-full object-contain md:max-h-none"
          />
        </div>

        <div className="overflow-y-auto p-5 scroll-slim">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-espresso-900">File details</h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="mt-3 space-y-1.5 text-xs text-espresso-400">
            <div className="flex justify-between gap-3">
              <dt>Folder</dt>
              <dd className="font-mono text-espresso-600">{asset.folder}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Size</dt>
              <dd className="text-espresso-600">
                {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                {formatBytes(asset.bytes)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Uploaded</dt>
              <dd className="text-espresso-600">{formatDateTime(asset.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Used on the site</dt>
              <dd className="text-espresso-600">{asset.usageCount} place{asset.usageCount === 1 ? '' : 's'}</dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3">
            <Field label="Title">
              <Input value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
            </Field>
            <Field
              label="Alt text"
              hint="Describe the picture for people using a screen reader. This also helps Google understand the image."
            >
              <Input value={values.altText} onChange={(e) => setValues((v) => ({ ...v, altText: e.target.value }))} />
            </Field>
            <Field label="Caption">
              <Textarea rows={2} value={values.caption} onChange={(e) => setValues((v) => ({ ...v, caption: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => onSave(values)} disabled={pending}>
              {pending ? <Spinner /> : null}
              Save details
            </Button>
            <Button variant="outline" onClick={onCopy}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            {canDelete ? (
              <Button variant="ghost" className="text-chilli-600 hover:bg-red-50" onClick={onDelete} disabled={pending}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
