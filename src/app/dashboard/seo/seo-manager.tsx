'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, CardDescription, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';

interface SeoGlobal {
  siteName: string;
  titleTemplate: string;
  defaultTitle: string;
  defaultDescription: string | null;
  defaultOgImageUrl: string | null;
  twitterHandle: string | null;
  googleSiteVerification: string | null;
  bingSiteVerification: string | null;
  gaMeasurementId: string | null;
  clarityProjectId: string | null;
  allowIndexing: boolean;
}

interface SeoEntry {
  id: string;
  path: string;
  title: string | null;
  description: string | null;
  keywords: string | null;
  noIndex: boolean;
  noFollow: boolean;
  priority: number;
  changeFreq: string;
}

export function SeoManager({
  seo,
  entries,
  napComplete,
  hasGeo,
  canManage,
}: {
  seo: SeoGlobal;
  entries: SeoEntry[];
  napComplete: boolean;
  hasGeo: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(seo);
  const [editing, setEditing] = useState<SeoEntry | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SeoEntry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function set<K extends keyof SeoGlobal>(key: K, value: SeoGlobal[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function saveGlobal(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    try {
      await api.patch('/api/seo/global', values);
      toast.success('Search settings saved');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the settings.');
    } finally {
      setPending(false);
    }
  }

  async function removeEntry() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/seo/entries/${toDelete.id}`);
      toast.success('Page settings removed');
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
      {!values.allowIndexing ? (
        <Alert tone="warning" title="The website is hidden from search engines">
          Nothing on the site will appear in Google while this is off. It is the right setting for a staging site, and
          the wrong one for a live restaurant.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Local search readiness</CardTitle>
            <CardDescription>
              These are the things that actually move a restaurant up in local results.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2 text-sm">
            <ChecklistItem
              done={napComplete}
              label="Address and phone are filled in"
              detail="Google matches these against your Business Profile. They must be identical, character for character."
              href="/dashboard/settings"
            />
            <ChecklistItem
              done={hasGeo}
              label="Map coordinates are set"
              detail="Latitude and longitude go into the structured data so you can be placed precisely."
              href="/dashboard/settings"
            />
            <ChecklistItem
              done={Boolean(values.defaultDescription)}
              label="A default description is written"
              detail="Used for any page that has no description of its own."
            />
            <ChecklistItem
              done={Boolean(values.defaultOgImageUrl)}
              label="A social share image is set"
              detail="The picture people see when your link is shared on Facebook or WhatsApp."
            />
            <ChecklistItem
              done={values.allowIndexing}
              label="Search engines are allowed in"
              detail="Turn this on when the site is ready for customers."
            />
            <ChecklistItem
              done={Boolean(values.googleSiteVerification)}
              label="Google Search Console is verified"
              detail="Lets you see which searches bring people to you."
            />
          </ul>
          <p className="mt-4 rounded-lg bg-cream-100 px-4 py-3 text-xs text-espresso-500">
            Doing all of this makes the site technically sound and locally relevant. No one can promise a particular
            position in Google, and any tool that does is guessing.
          </p>
        </CardBody>
      </Card>

      <form onSubmit={saveGlobal} className="space-y-5">
        {message ? <Alert tone="danger">{message}</Alert> : null}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>How the site appears in search</CardTitle>
              <CardDescription>Used for any page that does not set its own.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site name" required error={errors.siteName}>
                <Input value={values.siteName} onChange={(e) => set('siteName', e.target.value)} disabled={!canManage} />
              </Field>
              <Field label="Title pattern" hint="%s is replaced by the page name." error={errors.titleTemplate}>
                <Input value={values.titleTemplate} onChange={(e) => set('titleTemplate', e.target.value)} disabled={!canManage} />
              </Field>
            </div>

            <Field label="Default title" required error={errors.defaultTitle} hint={`${values.defaultTitle.length}/60 characters is ideal`}>
              <Input value={values.defaultTitle} onChange={(e) => set('defaultTitle', e.target.value)} disabled={!canManage} />
            </Field>

            <Field
              label="Default description"
              error={errors.defaultDescription}
              hint={`${(values.defaultDescription ?? '').length}/160 characters is ideal`}
            >
              <Textarea
                rows={3}
                value={values.defaultDescription ?? ''}
                onChange={(e) => set('defaultDescription', e.target.value)}
                disabled={!canManage}
              />
            </Field>

            <MediaPicker
              slotKey="og"
              label="Default social share image"
              value={values.defaultOgImageUrl}
              onChange={(url) => set('defaultOgImageUrl', url)}
            />

            {/* A live preview of the Google result, so the character counts mean something. */}
            <div className="rounded-lg border border-espresso-100 bg-white p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-espresso-400">
                How this looks in Google
              </p>
              <p className="truncate text-sm text-[#1a0dab]">{values.defaultTitle || values.siteName}</p>
              <p className="truncate text-xs text-[#006621]">
                {process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-domain.com'}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-espresso-600">
                {values.defaultDescription || 'Add a description so Google shows your own words here.'}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Verification and analytics</CardTitle>
              <CardDescription>Nothing is loaded unless you fill it in — no ID, no script.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Google Search Console verification" hint="The content value of the meta tag Google gives you.">
                <Input
                  value={values.googleSiteVerification ?? ''}
                  onChange={(e) => set('googleSiteVerification', e.target.value)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Bing verification">
                <Input
                  value={values.bingSiteVerification ?? ''}
                  onChange={(e) => set('bingSiteVerification', e.target.value)}
                  disabled={!canManage}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Google Analytics ID" error={errors.gaMeasurementId} hint="Looks like G-XXXXXXXXXX">
                <Input
                  value={values.gaMeasurementId ?? ''}
                  onChange={(e) => set('gaMeasurementId', e.target.value)}
                  disabled={!canManage}
                  placeholder="G-XXXXXXXXXX"
                />
              </Field>
              <Field label="Microsoft Clarity project ID" hint="Optional — session recordings and heatmaps.">
                <Input
                  value={values.clarityProjectId ?? ''}
                  onChange={(e) => set('clarityProjectId', e.target.value)}
                  disabled={!canManage}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search engine access</CardTitle>
          </CardHeader>
          <CardBody>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-espresso-100 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-espresso-800">Allow search engines to index the site</span>
                <span className="block text-xs text-espresso-400">
                  Turn off only for a staging site or before launch. While off, robots.txt blocks everything.
                </span>
              </span>
              <Toggle
                checked={values.allowIndexing}
                onChange={(v) => set('allowIndexing', v)}
                disabled={!canManage}
                label="Allow indexing"
              />
            </label>
          </CardBody>
        </Card>

        {canManage ? (
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : <Save className="h-4 w-4" />}
            Save search settings
          </Button>
        ) : null}
      </form>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Individual pages</CardTitle>
            <CardDescription>Override the title and description for a specific page.</CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" />
              Add a page
            </Button>
          ) : null}
        </CardHeader>
        <CardBody>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-espresso-400">
              No page-specific settings yet — every page uses the defaults above.
            </p>
          ) : (
            <ul className="divide-y divide-espresso-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={entry.path}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-espresso-900 hover:text-saffron-700"
                      >
                        {entry.path}
                        <ExternalLink className="ml-1 inline h-3 w-3" />
                      </Link>
                      {entry.noIndex ? <Badge tone="warning">hidden from Google</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-espresso-400">{entry.title ?? 'Uses the default title'}</p>
                  </div>
                  {canManage ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => setToDelete(entry)}
                        className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                        aria-label={`Remove settings for ${entry.path}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {editing ? (
        <EntryForm
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success('Page settings saved');
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove the settings for ${toDelete?.path}?`}
        confirmLabel="Remove"
        pending={pending}
        description="The page falls back to the default title and description."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void removeEntry()}
      />
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  detail,
  href,
}: {
  done: boolean;
  label: string;
  detail: string;
  href?: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={
          done
            ? 'mt-0.5 text-basil-500'
            : 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-espresso-200'
        }
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : null}
      </span>
      <span className="min-w-0">
        <span className={done ? 'block font-medium text-espresso-700' : 'block font-medium text-espresso-900'}>
          {label}
          {!done && href ? (
            <Link href={href} className="ml-2 text-xs font-normal text-saffron-700 hover:underline">
              set it up
            </Link>
          ) : null}
        </span>
        <span className="block text-xs text-espresso-400">{detail}</span>
      </span>
    </li>
  );
}

function EntryForm({
  entry,
  onClose,
  onDone,
}: {
  entry: SeoEntry | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState({
    path: entry?.path ?? '/',
    title: entry?.title ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ?? '',
    noIndex: entry?.noIndex ?? false,
    priority: String(entry?.priority ?? 0.5),
    changeFreq: entry?.changeFreq ?? 'weekly',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});
    const payload = {
      path: values.path.trim(),
      title: values.title.trim() || null,
      description: values.description.trim() || null,
      keywords: values.keywords.trim() || null,
      noIndex: values.noIndex,
      priority: Number(values.priority),
      changeFreq: values.changeFreq,
    };
    try {
      if (entry) await api.patch(`/api/seo/entries/${entry.id}`, payload);
      else await api.post('/api/seo/entries', payload);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the page settings.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-espresso-950/50" onClick={onClose} aria-hidden />
      <Card className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto scroll-slim">
        <CardHeader>
          <CardTitle>{entry ? `Settings for ${entry.path}` : 'Page settings'}</CardTitle>
          <button type="button" onClick={onClose} className="rounded p-1 text-espresso-400 hover:bg-cream-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            {message ? <Alert tone="danger">{message}</Alert> : null}

            <Field label="Page address" required error={errors.path} hint="Starts with a slash, e.g. /menu">
              <Input
                value={values.path}
                onChange={(e) => setValues((v) => ({ ...v, path: e.target.value }))}
                disabled={Boolean(entry)}
                required
              />
            </Field>

            <Field label="Title" error={errors.title} hint={`${values.title.length}/60 characters is ideal`}>
              <Input value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
            </Field>

            <Field label="Description" error={errors.description} hint={`${values.description.length}/160 characters is ideal`}>
              <Textarea rows={3} value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sitemap priority" hint="0 to 1. Higher means more important.">
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={values.priority}
                  onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value }))}
                />
              </Field>
              <Field label="How often it changes">
                <Select value={values.changeFreq} onChange={(e) => setValues((v) => ({ ...v, changeFreq: e.target.value }))}>
                  {['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-espresso-700">
              <Checkbox checked={values.noIndex} onChange={(e) => setValues((v) => ({ ...v, noIndex: e.target.checked }))} />
              Hide this page from Google
            </label>

            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : null}
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
