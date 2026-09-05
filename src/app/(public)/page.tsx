import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Clock, MapPin, Star, UtensilsCrossed } from 'lucide-react';
import { getSettings, toPublicSettings } from '@/lib/settings';
import {
  getActiveOffers,
  getApprovedReviews,
  getContentBlocks,
  getFeaturedItems,
  getGallery,
  getPublishedCategories,
  getReviewSummary,
  getTodaysSpecials,
  getUpcomingEvents,
} from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate } from '@/lib/format';
import { CldImage } from '@/components/public/cld-image';
import { MenuCard } from '@/components/public/menu-card';
import { Section, SectionHeading } from '@/components/public/section';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return buildMetadata({
    path: '/',
    fallbackTitle: `${settings.name} — ${settings.tagline ?? 'Restaurant'}`,
    fallbackDescription: settings.description ?? undefined,
  });
}

interface HeroBlock {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  imageUrl?: string;
}

interface HighlightsBlock {
  heading?: string;
  items?: { title: string; body: string }[];
}

interface AboutBlock {
  heading?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  imageUrl?: string;
}

interface CtaBlock {
  heading?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export default async function HomePage() {
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const [blocks, categories, featured, specials, offers, events, reviews, summary, gallery] = await Promise.all([
    getContentBlocks('home'),
    getPublishedCategories(),
    getFeaturedItems(8),
    getTodaysSpecials(4),
    getActiveOffers(3),
    getUpcomingEvents(3),
    getApprovedReviews({ take: 3, featuredOnly: false }),
    getReviewSummary(),
    getGallery(6),
  ]);

  const hero = (blocks['home.hero'] ?? {}) as HeroBlock;
  const highlights = (blocks['home.highlights'] ?? {}) as HighlightsBlock;
  const about = (blocks['home.about'] ?? {}) as AboutBlock;
  const cta = (blocks['home.cta'] ?? {}) as CtaBlock;

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden bg-espresso-900">
        {hero.imageUrl ? (
          <div className="absolute inset-0">
            <CldImage src={hero.imageUrl} alt="" priority rounded={false} className="h-full" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-r from-espresso-950/90 via-espresso-950/70 to-espresso-950/40" />
          </div>
        ) : (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 15% 25%, #f9860a 0, transparent 42%), radial-gradient(circle at 85% 75%, #b74806 0, transparent 38%)',
            }}
          />
        )}

        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="max-w-2xl animate-fade-up">
            {hero.eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron-400">{hero.eyebrow}</p>
            ) : null}
            <h1 className="mt-3 font-[family-name:--font-display] text-4xl font-semibold leading-[1.1] tracking-tight text-cream-50 sm:text-5xl lg:text-6xl">
              {hero.heading ?? settings.name}
            </h1>
            {hero.subheading ? (
              <p className="mt-5 max-w-xl text-base leading-relaxed text-cream-200 sm:text-lg">{hero.subheading}</p>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {settings.reservationsEnabled ? (
                <Link
                  href={hero.primaryCtaHref ?? '/reservation'}
                  className="inline-flex items-center gap-2 rounded-lg bg-saffron-500 px-6 py-3 text-sm font-semibold text-espresso-950 transition-colors hover:bg-saffron-400"
                >
                  {hero.primaryCtaLabel ?? 'Reserve a table'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
              <Link
                href={hero.secondaryCtaHref ?? '/menu'}
                className="inline-flex items-center gap-2 rounded-lg border border-cream-300/40 px-6 py-3 text-sm font-semibold text-cream-50 transition-colors hover:bg-cream-50/10"
              >
                <UtensilsCrossed className="h-4 w-4" />
                {hero.secondaryCtaLabel ?? 'See the menu'}
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-cream-300">
              {settings.city ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-saffron-400" />
                  {[settings.addressLine1, settings.city].filter(Boolean).join(', ')}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-saffron-400" />
                Open 7 days a week
              </span>
              {summary.count > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Star className="h-4 w-4 fill-saffron-400 text-saffron-400" />
                  {summary.average.toFixed(1)} from {summary.count} review{summary.count === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Today's special */}
      {specials.length > 0 ? (
        <Section>
          <SectionHeading
            eyebrow="Fresh from the kitchen"
            title="Today’s specials"
            description="Cooked in small batches and only while they last."
            linkHref="/menu"
            linkLabel="Full menu"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {specials.map((item, index) => (
              <MenuCard key={item.id} item={item} currency={currency} priority={index < 2} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ------------------------------------------------------- Categories */}
      {categories.length > 0 ? (
        <Section tone="muted">
          <SectionHeading
            eyebrow="Browse"
            title="Popular categories"
            description="Everything on our menu, grouped the way you would order it."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                href={`/menu?category=${category.slug}`}
                className="group relative overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white transition-shadow hover:shadow-lg"
              >
                <CldImage
                  src={category.imageUrl}
                  alt={category.name}
                  aspect="16 / 10"
                  rounded={false}
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="transition-transform duration-300 group-hover:scale-105"
                />
                <div className="p-4">
                  <h3 className="font-medium text-espresso-900 group-hover:text-saffron-700">{category.name}</h3>
                  <p className="mt-0.5 text-xs text-espresso-400">
                    {category._count.items} dish{category._count.items === 1 ? '' : 'es'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* --------------------------------------------------------- Featured */}
      {featured.length > 0 ? (
        <Section>
          <SectionHeading
            eyebrow="Guest favourites"
            title="What people order most"
            linkHref="/menu"
            linkLabel="See everything"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.slice(0, 8).map((item) => (
              <MenuCard key={item.id} item={item} currency={currency} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ----------------------------------------------------------- Offers */}
      {offers.length > 0 ? (
        <Section tone="muted">
          <SectionHeading eyebrow="Save a little" title="Current offers" linkHref="/offers" linkLabel="All offers" />
          <div className="grid gap-5 md:grid-cols-3">
            {offers.map((offer) => (
              <Link
                key={offer.id}
                href="/offers"
                className="group flex flex-col overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white transition-shadow hover:shadow-lg"
              >
                <CldImage src={offer.imageUrl} alt={offer.title} aspect="16 / 9" rounded={false} sizes="(min-width: 768px) 33vw, 100vw" />
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-medium text-espresso-900 group-hover:text-saffron-700">{offer.title}</h3>
                  {offer.subtitle ? <p className="mt-1.5 text-sm text-espresso-400">{offer.subtitle}</p> : null}
                  {offer.endsAt ? (
                    <p className="mt-auto pt-3 text-xs text-espresso-400">
                      Until {formatDate(offer.endsAt, settings.timezone, settings.locale)}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ----------------------------------------------------------- About */}
      {about.heading ? (
        <Section>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <CldImage
              src={about.imageUrl}
              alt=""
              aspect="4 / 3"
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="order-last lg:order-first"
            />
            <div>
              <h2 className="font-[family-name:--font-display] text-2xl font-semibold tracking-tight text-espresso-900 sm:text-3xl">
                {about.heading}
              </h2>
              {about.body ? <p className="mt-4 leading-relaxed text-espresso-600">{about.body}</p> : null}
              {about.ctaHref && about.ctaLabel ? (
                <Link
                  href={about.ctaHref}
                  className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-saffron-700 hover:text-saffron-800"
                >
                  {about.ctaLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      {/* ------------------------------------------------------ Highlights */}
      {highlights.items?.length ? (
        <Section tone="muted">
          <SectionHeading title={highlights.heading ?? 'Why guests come back'} align="center" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.items.map((item) => (
              <div key={item.title} className="rounded-[--radius-card] border border-espresso-100 bg-white p-6">
                <h3 className="font-medium text-espresso-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-espresso-400">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ---------------------------------------------------------- Events */}
      {events.length > 0 ? (
        <Section>
          <SectionHeading eyebrow="Coming up" title="Events at the restaurant" linkHref="/events" linkLabel="All events" />
          <div className="grid gap-5 md:grid-cols-3">
            {events.map((event) => (
              <article key={event.id} className="overflow-hidden rounded-[--radius-card] border border-espresso-100 bg-white">
                <CldImage src={event.imageUrl} alt={event.title} aspect="16 / 9" rounded={false} sizes="(min-width: 768px) 33vw, 100vw" />
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-saffron-700">
                    {formatDate(event.startsAt, settings.timezone, settings.locale)}
                  </p>
                  <h3 className="mt-1.5 font-medium text-espresso-900">{event.title}</h3>
                  {event.venue ? <p className="mt-1 text-xs text-espresso-400">{event.venue}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {/* --------------------------------------------------------- Reviews */}
      {reviews.length > 0 ? (
        <Section tone="muted">
          <SectionHeading
            eyebrow="In their words"
            title="What guests say"
            linkHref="/reviews"
            linkLabel="Read all reviews"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {reviews.map((review) => (
              <figure key={review.id} className="flex flex-col rounded-[--radius-card] border border-espresso-100 bg-white p-6">
                <div className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={i < review.rating ? 'h-4 w-4 fill-saffron-400 text-saffron-400' : 'h-4 w-4 text-espresso-200'}
                    />
                  ))}
                </div>
                {review.title ? <h3 className="mt-3 font-medium text-espresso-900">{review.title}</h3> : null}
                <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-espresso-600">
                  “{review.body}”
                </blockquote>
                <figcaption className="mt-4 text-xs font-medium text-espresso-400">— {review.authorName}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {/* --------------------------------------------------------- Gallery */}
      {gallery.length > 0 ? (
        <Section>
          <SectionHeading eyebrow="Inside" title="A look around" linkHref="/gallery" linkLabel="Open gallery" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {gallery.map((photo) => (
              <CldImage
                key={photo.id}
                src={photo.media.secureUrl}
                alt={photo.media.altText || photo.title || 'Restaurant photo'}
                aspect="1 / 1"
                sizes="(min-width: 1024px) 16vw, 33vw"
              />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ------------------------------------------------------------- CTA */}
      {cta.heading && settings.reservationsEnabled ? (
        <Section tone="dark">
          <div className="flex flex-col items-center gap-5 text-center">
            <h2 className="font-[family-name:--font-display] text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
              {cta.heading}
            </h2>
            {cta.body ? <p className="max-w-xl text-cream-300">{cta.body}</p> : null}
            <Link
              href={cta.ctaHref ?? '/reservation'}
              className="inline-flex items-center gap-2 rounded-lg bg-saffron-500 px-6 py-3 text-sm font-semibold text-espresso-950 transition-colors hover:bg-saffron-400"
            >
              {cta.ctaLabel ?? 'Book a table'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Section>
      ) : null}
    </>
  );
}
