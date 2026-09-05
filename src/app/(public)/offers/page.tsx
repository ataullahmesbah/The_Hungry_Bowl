import type { Metadata } from 'next';
import { BadgePercent, Ticket } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { getActiveOffers } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate, formatMoney } from '@/lib/format';
import { toPublicSettings } from '@/lib/settings';
import { CldImage } from '@/components/public/cld-image';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    path: '/offers',
    fallbackTitle: 'Offers & Promotions',
    fallbackDescription: 'Current offers and promotions at the restaurant.',
  });
}

export default async function OffersPage() {
  const settings = await getSettings();
  const currency = toPublicSettings(settings);
  const offers = await getActiveOffers();

  function offerValue(offer: (typeof offers)[number]): string | null {
    if (offer.value == null) return null;
    if (offer.type === 'PERCENTAGE') return `${Number(offer.value)}% off`;
    if (offer.type === 'FIXED_AMOUNT') return `${formatMoney(offer.value, currency)} off`;
    if (offer.type === 'SPECIAL_PRICE') return formatMoney(offer.value, currency);
    return null;
  }

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Offers &amp; promotions
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">
            Everything running right now. All offers are dine-in unless the terms say otherwise.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {offers.length === 0 ? (
          <div className="py-20 text-center">
            <BadgePercent className="mx-auto h-10 w-10 text-espresso-200" />
            <p className="mt-3 text-espresso-400">No offers are running at the moment. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {offers.map((offer) => {
              const value = offerValue(offer);
              return (
                <article
                  key={offer.id}
                  className="flex flex-col overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white"
                >
                  <CldImage src={offer.imageUrl} alt={offer.title} aspect="16 / 9" rounded={false} sizes="(min-width: 768px) 50vw, 100vw" />
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-[family-name:--font-display] text-xl font-semibold text-espresso-900">
                        {offer.title}
                      </h2>
                      {value ? (
                        <span className="shrink-0 rounded-lg bg-saffron-500 px-3 py-1.5 text-sm font-bold text-espresso-950">
                          {value}
                        </span>
                      ) : null}
                    </div>

                    {offer.subtitle ? <p className="mt-1.5 text-espresso-600">{offer.subtitle}</p> : null}
                    {offer.description ? (
                      <p className="mt-3 text-sm leading-relaxed text-espresso-400">{offer.description}</p>
                    ) : null}

                    {offer.couponCode ? (
                      <p className="mt-4 inline-flex items-center gap-2 self-start rounded-lg border border-dashed border-espresso-300 px-3 py-2 text-sm">
                        <Ticket className="h-4 w-4 text-saffron-600" />
                        <span className="font-mono font-semibold text-espresso-900">{offer.couponCode}</span>
                      </p>
                    ) : null}

                    <div className="mt-auto space-y-2 pt-5 text-xs text-espresso-400">
                      {offer.startsAt || offer.endsAt ? (
                        <p>
                          {offer.startsAt ? `From ${formatDate(offer.startsAt, settings.timezone, settings.locale)}` : ''}
                          {offer.startsAt && offer.endsAt ? ' · ' : ''}
                          {offer.endsAt ? `Until ${formatDate(offer.endsAt, settings.timezone, settings.locale)}` : ''}
                        </p>
                      ) : null}
                      {offer.terms ? <p>{offer.terms}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
