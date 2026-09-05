import type { Metadata } from 'next';
import { CalendarDays, MapPin } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { getUpcomingEvents } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDateTime } from '@/lib/format';
import { CldImage } from '@/components/public/cld-image';
import { JsonLd, eventJsonLd } from '@/lib/seo/structured-data';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    path: '/events',
    fallbackTitle: 'Events',
    fallbackDescription: 'Special evenings and programmes at the restaurant.',
  });
}

export default async function EventsPage() {
  const settings = await getSettings();
  const events = await getUpcomingEvents();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Events &amp; special programmes
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">
            Seating for events is limited — reserving ahead is recommended.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {events.length === 0 ? (
          <div className="py-20 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-espresso-200" />
            <p className="mt-3 text-espresso-400">Nothing scheduled right now. Follow us for announcements.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {events.map((event) => (
              <article
                key={event.id}
                className="grid overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white md:grid-cols-[320px_1fr]"
              >
                <CldImage
                  src={event.imageUrl}
                  alt={event.title}
                  aspect="16 / 9"
                  rounded={false}
                  sizes="(min-width: 768px) 320px, 100vw"
                  className="h-full"
                />
                <div className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-saffron-700">
                    {formatDateTime(event.startsAt, settings.timezone, settings.locale)}
                  </p>
                  <h2 className="mt-2 font-[family-name:--font-display] text-xl font-semibold text-espresso-900">
                    {event.title}
                  </h2>
                  {event.venue ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-espresso-400">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.venue}
                    </p>
                  ) : null}
                  {event.description ? (
                    <p className="mt-3 text-sm leading-relaxed text-espresso-600">{event.description}</p>
                  ) : null}
                  {event.ticketInfo ? (
                    <p className="mt-4 rounded-lg bg-cream-100 px-4 py-2.5 text-sm text-espresso-700">
                      {event.ticketInfo}
                    </p>
                  ) : null}
                </div>
                <JsonLd data={eventJsonLd(event, settings, baseUrl)} />
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
