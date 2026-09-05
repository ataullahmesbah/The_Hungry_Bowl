'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDateTime, slugify } from '@/lib/format';

interface EventRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  ticketInfo: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isFeatured: boolean;
}

interface Draft {
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  venue: string;
  ticketInfo: string;
  status: EventRow['status'];
  isFeatured: boolean;
}

const EMPTY: Draft = {
  title: '',
  slug: '',
  description: '',
  imageUrl: null,
  startsAt: '',
  endsAt: '',
  venue: '',
  ticketInfo: '',
  status: 'PUBLISHED',
  isFeatured: false,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function EventsManager({
  events,
  timezone,
  locale,
  canManage,
}: {
  events: EventRow[];
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
  const [toDelete, setToDelete] = useState<EventRow | null>(null);

  function startEdit(event: EventRow) {
    setEditing(event.id);
    setErrors({});
    setMessage(null);
    setDraft({
      title: event.title,
      slug: event.slug,
      description: event.description ?? '',
      imageUrl: event.imageUrl,
      startsAt: toLocalInput(event.startsAt),
      endsAt: toLocalInput(event.endsAt),
      venue: event.venue ?? '',
      ticketInfo: event.ticketInfo ?? '',
      status: event.status,
      isFeatured: event.isFeatured,
    });
  }

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    if (!draft.startsAt) {
      setErrors({ startsAt: 'Choose when the event starts' });
      setPending(false);
      return;
    }
    const payload = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || slugify(draft.title),
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl,
      startsAt: new Date(draft.startsAt).toISOString(),
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      venue: draft.venue.trim() || null,
      ticketInfo: draft.ticketInfo.trim() || null,
      status: draft.status,
      isFeatured: draft.isFeatured,
    };
    try {
      if (editing === 'new') await api.post('/api/cms/events', payload);
      else await api.patch(`/api/cms/events/${editing}`, payload);
      toast.success('Event saved');
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the event.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setPending(true);
    try {
      await api.del(`/api/cms/events/${toDelete.id}`);
      toast.success('Event archived');
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
          New event
        </Button>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'New event' : 'Edit event'}</CardTitle>
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
                  placeholder="Winter Grill Night"
                />
              </Field>
              <Field label="Slug" required error={errors.slug}>
                <Input value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))} />
              </Field>
            </div>

            <Field label="Description" error={errors.description}>
              <Textarea rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </Field>

            <MediaPicker
              slotKey="event"
              label="Event banner"
              subFolder={draft.slug || undefined}
              value={draft.imageUrl}
              onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" required error={errors.startsAt}>
                <Input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))} />
              </Field>
              <Field label="Ends" error={errors.endsAt}>
                <Input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue" error={errors.venue}>
                <Input value={draft.venue} onChange={(e) => setDraft((d) => ({ ...d, venue: e.target.value }))} placeholder="Rooftop, First Floor" />
              </Field>
              <Field label="Ticket / entry info" error={errors.ticketInfo}>
                <Input value={draft.ticketInfo} onChange={(e) => setDraft((d) => ({ ...d, ticketInfo: e.target.value }))} placeholder="Free entry, reservation recommended" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as EventRow['status'] }))}>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-espresso-700">
                  <Checkbox checked={draft.isFeatured} onChange={(e) => setDraft((d) => ({ ...d, isFeatured: e.target.checked }))} />
                  Show on home page
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void save()} disabled={pending}>
                {pending ? <Spinner /> : null}
                Save event
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        {events.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-espresso-400">No events yet.</p>
        ) : (
          <ul className="divide-y divide-espresso-100">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-espresso-900">
                    {event.title}
                    <Badge tone={event.status === 'PUBLISHED' ? 'success' : 'neutral'}>{event.status.toLowerCase()}</Badge>
                    {new Date(event.startsAt) < new Date() ? <Badge tone="neutral">past</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-espresso-400">
                    {formatDateTime(event.startsAt, timezone, locale)}
                    {event.venue ? ` · ${event.venue}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(event)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <button
                      type="button"
                      onClick={() => setToDelete(event)}
                      className="rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                      aria-label={`Archive ${event.title}`}
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
        description="The event is removed from the website. It stays in your records."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
