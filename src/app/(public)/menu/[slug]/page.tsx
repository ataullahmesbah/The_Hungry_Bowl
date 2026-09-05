import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Clock, Flame, Leaf, ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { getItemBySlug, getPublishedItems } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { publicPriceLabel, spiceLabel } from '@/lib/public/menu';
import { formatMoney } from '@/lib/format';
import { CldImage } from '@/components/public/cld-image';
import { MenuCard } from '@/components/public/menu-card';
import { JsonLd, breadcrumbJsonLd, menuItemJsonLd } from '@/lib/seo/structured-data';

export const revalidate = 60;

/** Pre-render the published menu at build time; new items fall back to SSR. */
export async function generateStaticParams() {
  try {
    const items = await prisma.menuItem.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: { slug: true },
      take: 200,
    });
    return items.map((item) => ({ slug: item.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) return { title: 'Dish not found' };

  return buildMetadata({
    path: `/menu/${slug}`,
    fallbackTitle: item.metaTitle || item.name,
    fallbackDescription: item.metaDescription || item.shortDescription || undefined,
    image: item.media[0]?.media.secureUrl,
    type: 'article',
  });
}

export default async function MenuItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getItemBySlug(slug);
  if (!item) notFound();

  const settings = await getSettings();
  const currency = toPublicSettings(settings);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const price = publicPriceLabel(item, item.variants, currency);
  const related = (await getPublishedItems({ categorySlug: item.category.slug }))
    .filter((i) => i.slug !== item.slug)
    .slice(0, 4);

  const gallery = item.media.filter((m) => m.media.type === 'IMAGE');

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href={`/menu?category=${item.category.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-espresso-400 hover:text-espresso-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {item.category.name}
          </Link>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <CldImage
              src={gallery[0]?.media.secureUrl}
              alt={gallery[0]?.media.altText || item.name}
              aspect="4 / 3"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
            {gallery.length > 1 ? (
              <div className="mt-3 grid grid-cols-4 gap-3">
                {gallery.slice(1, 5).map((media, index) => (
                  <CldImage
                    key={index}
                    src={media.media.secureUrl}
                    alt={media.media.altText || `${item.name} photo ${index + 2}`}
                    aspect="1 / 1"
                    sizes="12vw"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {item.isTodaysSpecial ? (
                <span className="rounded-full bg-saffron-500 px-2.5 py-1 text-[11px] font-semibold text-espresso-950">
                  Today’s special
                </span>
              ) : null}
              {item.isFeatured ? (
                <span className="rounded-full bg-espresso-100 px-2.5 py-1 text-[11px] font-semibold text-espresso-700">
                  Guest favourite
                </span>
              ) : null}
              {!item.isAvailable ? (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                  Unavailable today
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
              {item.name}
            </h1>

            {item.shortDescription ? (
              <p className="mt-2 text-lg text-espresso-600">{item.shortDescription}</p>
            ) : null}

            <div className="mt-5">
              {price ? (
                <p className="text-2xl font-semibold tabular-nums text-espresso-900">{price}</p>
              ) : (
                <p className="text-base italic text-espresso-400">
                  Price varies — please ask a member of staff for today’s price.
                </p>
              )}
            </div>

            {item.description ? (
              <div className="prose-hb mt-6 text-espresso-600">
                <p>{item.description}</p>
              </div>
            ) : null}

            {/* Sizes */}
            {item.variants.length > 0 && item.priceDisplayMode !== 'HIDDEN' ? (
              <div className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-espresso-400">Sizes</h2>
                <ul className="mt-3 divide-y divide-espresso-100 rounded-lg border border-espresso-100">
                  {item.variants.map((variant) => (
                    <li key={variant.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-espresso-900">{variant.name}</p>
                        {variant.portionLabel ? (
                          <p className="text-xs text-espresso-400">{variant.portionLabel}</p>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-espresso-900">
                        {formatMoney(variant.price, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Add-ons */}
            {item.addOnGroups.length > 0 ? (
              <div className="mt-8 space-y-5">
                {item.addOnGroups.map(({ group }) => (
                  <div key={group.id}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-espresso-400">{group.name}</h2>
                    {group.description ? (
                      <p className="mt-0.5 text-xs text-espresso-400">{group.description}</p>
                    ) : null}
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                      {group.addOns.map((addOn) => (
                        <li
                          key={addOn.id}
                          className="rounded-full border border-espresso-200 px-3 py-1.5 text-xs text-espresso-700"
                        >
                          {addOn.name}
                          {Number(addOn.price) > 0 ? (
                            <span className="ml-1.5 font-medium text-espresso-900">
                              +{formatMoney(addOn.price, currency)}
                            </span>
                          ) : (
                            <span className="ml-1.5 text-basil-600">free</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Facts */}
            <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-espresso-100 pt-6 text-sm sm:grid-cols-3">
              {item.prepMinutes ? (
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-espresso-400">
                    <Clock className="h-3.5 w-3.5" />
                    Prepared in
                  </dt>
                  <dd className="mt-1 font-medium text-espresso-900">about {item.prepMinutes} min</dd>
                </div>
              ) : null}
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-espresso-400">
                  <Flame className="h-3.5 w-3.5" />
                  Spice
                </dt>
                <dd className="mt-1 font-medium text-espresso-900">{spiceLabel(item.spiceLevel)}</dd>
              </div>
              {item.isVegetarian ? (
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-espresso-400">
                    <Leaf className="h-3.5 w-3.5" />
                    Diet
                  </dt>
                  <dd className="mt-1 font-medium text-espresso-900">{item.isVegan ? 'Vegan' : 'Vegetarian'}</dd>
                </div>
              ) : null}
              {item.isHalal ? (
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-espresso-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Prepared
                  </dt>
                  <dd className="mt-1 font-medium text-espresso-900">Halal</dd>
                </div>
              ) : null}
              {item.calories ? (
                <div>
                  <dt className="text-xs text-espresso-400">Energy</dt>
                  <dd className="mt-1 font-medium text-espresso-900">{item.calories} cal</dd>
                </div>
              ) : null}
            </dl>

            {item.allergens.length > 0 ? (
              <p className="mt-5 rounded-lg bg-saffron-50 px-4 py-3 text-xs text-saffron-900">
                <strong className="font-semibold">Allergens:</strong> {item.allergens.join(', ')}. Please tell your
                server about any allergy before ordering.
              </p>
            ) : null}

            {settings.reservationsEnabled ? (
              <Link
                href="/reservation"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-espresso-900 px-6 py-3 text-sm font-semibold text-cream-50 transition-colors hover:bg-espresso-800"
              >
                Reserve a table
              </Link>
            ) : null}
            <p className="mt-3 text-xs text-espresso-400">
              We do not take online orders — order with a member of staff when you arrive.
            </p>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-[family-name:--font-display] text-2xl font-semibold tracking-tight text-espresso-900">
              More from {item.category.name}
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((related) => (
                <MenuCard key={related.id} item={related} currency={currency} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <JsonLd data={menuItemJsonLd(item, settings.currencyCode, baseUrl)} />
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: 'Home', url: '/' },
            { name: 'Menu', url: '/menu' },
            { name: item.category.name, url: `/menu?category=${item.category.slug}` },
            { name: item.name, url: `/menu/${item.slug}` },
          ],
          baseUrl,
        )}
      />
    </>
  );
}
