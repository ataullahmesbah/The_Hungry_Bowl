'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RichTextEditor } from '@/components/ui/rich-text';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDateTime, slugify } from '@/lib/format';

interface PageRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  kind: string;
  noIndex: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverUrl: string | null;
  status: PageRow['status'];
  kind: 'page' | 'post' | 'policy';
  noIndex: boolean;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverUrl: null,
  status: 'DRAFT',
  kind: 'page',
  noIndex: false,
  metaTitle: '',
  metaDescription: '',
};

export function PagesManager({
  pages,
  timezone,
  locale,
  canManage,
}: {
  pages: PageRow[];
  timezone: string;
  locale: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<PageRow | null>(null);

  function startEdit(page: PageRow) {
    setEditing(page.id);
    setErrors({});
    setMessage(null);
    setDraft({
      title: page.title,
      slug: page.slug,
      excerpt: page.excerpt ?? '',
      content: page.content,
      coverUrl: page.coverUrl,
      status: page.status,
      kind: (page.kind as Draft['kind']) ?? 'page',
      noIndex: page.noIndex,
      metaTitle: page.metaTitle ?? '',
      metaDescription: page.metaDescription ?? '',
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const payload = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || slugify(draft.title),
      excerpt: draft.excerpt.trim() || null,
      content: draft.content,
      coverUrl: draft.coverUrl,
      status: draft.status,
      kind: draft.kind,
      noIndex: draft.noIndex,
      metaTitle: draft.metaTitle.trim() || null,
      metaDescription: draft.metaDescription.trim() || null,
    };
    try {
      if (editing === 'new') await api.post('/api/cms/pages', payload);
      else await api.patch(`/api/cms/pages/${editing}`, payload);
      toast.success('Page saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the page.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/cms/pages/${toDelete.id}`);
      toast.success('Page archived');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {canManage && !editing ? (
        <Button
          onClick={() => {
            setEditing('new');
            setDraft(EMPTY);
            setErrors({});
            setMessage(null);
          }}
        >
          <Plus className="h-4 w-4" />
          New page
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New page' : 'Edit page'}</CardTitle>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" required error={errors.title}>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value, slug: editing === 'new' ? slugify(e.target.value) : d.slug }))}
                />
              </Field>
              <Field label="Web address" required error={errors.slug} hint={`Will be published at /${draft.slug || 'your-page'}`}>
                <Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} />
              </Field>
            </div>

            <Field label="Short summary" error={errors.excerpt} hint="Shown under the title and used as the search description if you leave the SEO fields blank.">
              <Textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))} />
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-espresso-800">Content</p>
              <RichTextEditor
                value={draft.content}
                onChange={(html) => setDraft((d) => ({ ...d, content: html }))}
                placeholder="Write the page here. Use the buttons above for headings, lists and links."
              />
              {errors.content ? <p className="mt-1 text-xs text-chilli-600">{errors.content}</p> : null}
            </div>

            <MediaPicker
              slotKey="hero"
              label="Cover image"
              subFolder={draft.slug || undefined}
              value={draft.coverUrl}
              onChange={(url) => setDraft((d) => ({ ...d, coverUrl: url }))}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as PageRow['status'] }))}>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as Draft['kind'] }))}>
                  <option value="page">Page</option>
                  <option value="post">Blog post</option>
                  <option value="policy">Policy</option>
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-espresso-700">
                  <Checkbox checked={draft.noIndex} onChange={(e) => setDraft((d) => ({ ...d, noIndex: e.target.checked }))} />
                  Hide from Google
                </label>
              </div>
            </div>

            <details className="rounded-lg border border-espresso-100 bg-cream-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-espresso-800">Search engine listing</summary>
              <div className="mt-4 space-y-4">
                <Field label="Meta title" hint={`${draft.metaTitle.length}/60 characters is ideal`}>
                  <Input value={draft.metaTitle} onChange={(e) => setDraft((d) => ({ ...d, metaTitle: e.target.value }))} />
                </Field>
                <Field label="Meta description" hint={`${draft.metaDescription.length}/160 characters is ideal`}>
                  <Textarea rows={2} value={draft.metaDescription} onChange={(e) => setDraft((d) => ({ ...d, metaDescription: e.target.value }))} />
                </Field>
              </div>
            </details>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save page
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        {pages.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-espresso-400">No pages yet.</p>
        ) : (
          <ul className="divide-y divide-espresso-100">
            {pages.map((page) => (
              <li key={page.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-espresso-900">
                    {page.title}
                    <Badge tone={page.status === 'PUBLISHED' ? 'success' : 'warning'}>{page.status.toLowerCase()}</Badge>
                    <Badge tone="neutral">{page.kind}</Badge>
                    {page.noIndex ? <Badge tone="warning">noindex</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-espresso-400">
                    /{page.slug} · updated {formatDateTime(page.updatedAt, timezone, locale)}
                  </p>
                </div>
                {page.status === 'PUBLISHED' ? (
                  <Link href={`/${page.slug}`} target="_blank" rel="noreferrer" className="rounded p-2 text-espresso-400 hover:bg-cream-100" aria-label={`View ${page.title}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                {canManage ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(page)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => setToDelete(page)}
                      className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                      aria-label={`Archive ${page.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Archive “${toDelete?.title}”?`}
        confirmLabel="Archive"
        pending={pending}
        description="The page is removed from the website. Any links to it will show a “page not found” message."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
