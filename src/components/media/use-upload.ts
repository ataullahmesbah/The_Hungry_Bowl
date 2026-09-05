'use client';

import { useCallback, useState } from 'react';
import { api, ApiError } from '@/lib/client/api-client';

export interface UploadedAsset {
  id: string;
  publicId: string;
  secureUrl: string;
  type: 'IMAGE' | 'VIDEO' | 'RAW';
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
}

interface SignaturePayload {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  tags?: string;
  uploadUrl: string;
}

/**
 * Two-step upload: ask our server to sign the request, send the file straight
 * to Cloudinary, then register the result in our database. The file never
 * travels through our own server, which is what keeps this working on
 * serverless hosting with a small request body limit.
 */
export function useUpload(folder: string, subFolder?: string) {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadedAsset | null> => {
      setError(null);
      setUploading(true);
      setProgress(0);

      try {
        const sign = await api.post<SignaturePayload>('/api/media/signature', { folder, subFolder });

        const form = new FormData();
        form.append('file', file);
        form.append('api_key', sign.apiKey);
        form.append('timestamp', String(sign.timestamp));
        form.append('signature', sign.signature);
        form.append('folder', sign.folder);
        if (sign.tags) form.append('tags', sign.tags);

        const cloudinaryResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', sign.uploadUrl);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
          };
          xhr.onload = () => {
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
              else reject(new Error(parsed?.error?.message ?? 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error while uploading'));
          xhr.send(form);
        });

        const registered = await api.post<UploadedAsset>('/api/media', {
          publicId: cloudinaryResult.public_id,
          url: cloudinaryResult.url,
          secureUrl: cloudinaryResult.secure_url,
          type: cloudinaryResult.resource_type === 'video' ? 'VIDEO' : 'IMAGE',
          format: cloudinaryResult.format,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          bytes: cloudinaryResult.bytes,
          duration: cloudinaryResult.duration,
          folder,
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 160),
        });

        setProgress(100);
        return registered;
      } catch (err) {
        setError(err instanceof ApiError || err instanceof Error ? err.message : 'Upload failed');
        return null;
      } finally {
        setUploading(false);
      }
    },
    [folder, subFolder],
  );

  return { upload, uploading, progress, error, setError };
}
