import type { Metadata } from 'next';
import { Star } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { getApprovedReviews, getReviewSummary } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate } from '@/lib/format';
import { ReviewForm } from './review-form';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    path: '/reviews',
    fallbackTitle: 'Customer Reviews',
    fallbackDescription: 'What guests say about their visit.',
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < rating ? 'h-4 w-4 fill-saffron-400 text-saffron-400' : 'h-4 w-4 text-espresso-200'}
        />
      ))}
    </div>
  );
}

export default async function ReviewsPage() {
  const settings = await getSettings();
  const [reviews, summary] = await Promise.all([getApprovedReviews(), getReviewSummary()]);

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Customer reviews
          </h1>
          {summary.count > 0 ? (
            <div className="mt-3 flex items-center gap-3">
              <Stars rating={Math.round(summary.average)} />
              <p className="text-sm text-espresso-600">
                <strong className="font-semibold text-espresso-900">{summary.average.toFixed(1)}</strong> from{' '}
                {summary.count} review{summary.count === 1 ? '' : 's'}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-espresso-400">Be the first to tell us how your visit went.</p>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div>
          {reviews.length === 0 ? (
            <p className="py-16 text-center text-espresso-400">No reviews published yet.</p>
          ) : (
            <ul className="space-y-5">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-[--radius-card] border border-espresso-100 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars rating={review.rating} />
                    <p className="text-xs text-espresso-400">
                      {formatDate(review.createdAt, settings.timezone, settings.locale)}
                    </p>
                  </div>
                  {review.title ? (
                    <h2 className="mt-3 font-medium text-espresso-900">{review.title}</h2>
                  ) : null}
                  <p className="mt-2 leading-relaxed text-espresso-600">{review.body}</p>
                  <p className="mt-4 text-sm font-medium text-espresso-400">— {review.authorName}</p>

                  {review.reply ? (
                    <div className="mt-4 rounded-lg border-l-2 border-saffron-400 bg-cream-100 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-saffron-700">
                        Reply from {settings.name}
                      </p>
                      <p className="mt-1.5 text-sm text-espresso-600">{review.reply}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {settings.reviewsEnabled ? (
          <aside>
            <div className="sticky top-24 rounded-[--radius-card] border border-espresso-100 bg-white p-6">
              <h2 className="font-[family-name:--font-display] text-xl font-semibold text-espresso-900">
                Write a review
              </h2>
              <p className="mt-1.5 text-sm text-espresso-400">
                {settings.reviewsRequireApproval
                  ? 'Reviews appear after a quick check by our team.'
                  : 'Your review will appear on this page.'}
              </p>
              <div className="mt-5">
                <ReviewForm />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}
