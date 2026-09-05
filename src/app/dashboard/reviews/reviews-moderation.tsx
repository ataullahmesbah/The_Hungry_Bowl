'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MessageSquare, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Badge, Card, CardBody, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/client/api-client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Review {
  id: string;
  authorName: string;
  authorEmail: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isFeatured: boolean;
  source: string;
  reply: string | null;
  createdAt: string;
}

const TABS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Published' },
  { key: 'REJECTED', label: 'Rejected' },
] as const;

export function ReviewsModeration({
  reviews,
  timezone,
  locale,
  canModerate,
}: {
  reviews: Review[];
  timezone: string;
  locale: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [toDelete, setToDelete] = useState<Review | null>(null);

  const counts = useMemo(
    () => ({
      PENDING: reviews.filter((r) => r.status === 'PENDING').length,
      APPROVED: reviews.filter((r) => r.status === 'APPROVED').length,
      REJECTED: reviews.filter((r) => r.status === 'REJECTED').length,
    }),
    [reviews],
  );

  const visible = reviews.filter((r) => r.status === tab);

  async function patch(review: Review, body: Record<string, unknown>, successMessage: string) {
    setBusyId(review.id);
    try {
      await api.patch(`/api/cms/reviews/${review.id}`, body);
      toast.success(successMessage);
      setReplyFor(null);
      setReplyText('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the review');
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await api.del(`/api/cms/reviews/${toDelete.id}`);
      toast.success('Review removed');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the review');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-espresso-200 bg-white p-1">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={cn(
              'flex-1 rounded px-3 py-2 text-sm font-medium transition-colors',
              tab === option.key ? 'bg-espresso-900 text-cream-50' : 'text-espresso-600 hover:bg-cream-100',
            )}
          >
            {option.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[option.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="px-5 py-12 text-center text-sm text-espresso-400">
            {tab === 'PENDING' ? 'Nothing waiting for approval.' : 'Nothing here.'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {visible.map((review) => (
            <li key={review.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={i < review.rating ? 'h-4 w-4 fill-saffron-400 text-saffron-400' : 'h-4 w-4 text-espresso-200'}
                            />
                          ))}
                        </div>
                        {review.isFeatured ? <Badge tone="accent">featured</Badge> : null}
                        <Badge tone="neutral">{review.source}</Badge>
                      </div>
                      <p className="mt-2 font-medium text-espresso-900">{review.title ?? review.authorName}</p>
                      <p className="text-xs text-espresso-400">
                        {review.authorName}
                        {review.authorEmail ? ` · ${review.authorEmail}` : ''} ·{' '}
                        {formatDateTime(review.createdAt, timezone, locale)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 leading-relaxed text-espresso-600">{review.body}</p>

                  {review.reply ? (
                    <div className="mt-3 rounded-lg border-l-2 border-saffron-400 bg-cream-100 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-saffron-700">Your reply</p>
                      <p className="mt-1 text-sm text-espresso-600">{review.reply}</p>
                    </div>
                  ) : null}

                  {replyFor === review.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        rows={3}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Thank you for visiting — we are glad the kacchi hit the mark."
                        aria-label="Reply to review"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void patch(review, { reply: replyText || null }, 'Reply saved')} disabled={busyId === review.id}>
                          {busyId === review.id ? <Spinner /> : null}
                          Save reply
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {canModerate ? (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-espresso-100 pt-4">
                      {review.status !== 'APPROVED' ? (
                        <Button size="sm" variant="success" onClick={() => void patch(review, { status: 'APPROVED' }, 'Review published')} disabled={busyId === review.id}>
                          <Check className="h-3.5 w-3.5" />
                          Publish
                        </Button>
                      ) : null}
                      {review.status !== 'REJECTED' ? (
                        <Button size="sm" variant="outline" onClick={() => void patch(review, { status: 'REJECTED' }, 'Review rejected')} disabled={busyId === review.id}>
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      ) : null}
                      {review.status === 'APPROVED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void patch(review, { isFeatured: !review.isFeatured }, review.isFeatured ? 'Removed from home page' : 'Added to home page')}
                          disabled={busyId === review.id}
                        >
                          <Star className="h-3.5 w-3.5" />
                          {review.isFeatured ? 'Remove from home' : 'Show on home page'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReplyFor(review.id);
                          setReplyText(review.reply ?? '');
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {review.reply ? 'Edit reply' : 'Reply'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setToDelete(review)}
                        className="ml-auto rounded p-2 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                        aria-label="Delete review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Remove this review?"
        confirmLabel="Remove"
        pending={Boolean(busyId)}
        description="The review is hidden everywhere. Use Reject instead if you only want it off the website."
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
