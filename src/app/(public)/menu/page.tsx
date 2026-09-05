import Link from 'next/link';
import type { Metadata } from 'next';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { getPublishedCategories, getPublishedItems } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { MenuCard } from '@/components/public/menu-card';
import { JsonLd, breadcrumbJsonLd } from '@/lib/seo/structured-data';
import { cn } from '@/lib/utils';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    path: '/menu',
    fallbackTitle: 'Menu',
    fallbackDescription: 'Browse the full menu — starters, biryani, curry, grill, pizza, burgers, desserts and drinks.',
  });
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const currency = toPublicSettings(settings);

  const [categories, items] = await Promise.all([
    getPublishedCategories(),
    getPublishedItems({ categorySlug: params.category }),
  ]);

  const active = params.category ? categories.find((c) => c.slug === params.category) : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Group by category when showing everything, so the page reads like a menu
  // rather than an undifferentiated grid.
  const grouped = active
    ? [{ category: active, items }]
    : categories
        .map((category) => ({ category, items: items.filter((i) => i.category.slug === category.slug) }))
        .filter((group) => group.items.length > 0);

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            {active ? active.name : 'Our menu'}
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">
            {active?.description ??
              'Cooked to order, seven days a week. Where a price is not shown, please ask a member of staff.'}
          </p>
        </div>
      </div>

      <nav
        aria-label="Menu categories"
        className="sticky top-16 z-30 border-b border-espresso-100 bg-cream-50/95 backdrop-blur"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto py-3 scroll-slim">
            <li>
              <Link
                href="/menu"
                className={cn(
                  'inline-block whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors',
                  !params.category
                    ? 'bg-espresso-900 font-medium text-cream-50'
                    : 'text-espresso-600 hover:bg-cream-200',
                )}
              >
                All
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/menu?category=${category.slug}`}
                  className={cn(
                    'inline-block whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors',
                    params.category === category.slug
                      ? 'bg-espresso-900 font-medium text-cream-50'
                      : 'text-espresso-600 hover:bg-cream-200',
                  )}
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {grouped.length === 0 ? (
          <p className="py-20 text-center text-espresso-400">
            Nothing to show here yet. Please check back soon.
          </p>
        ) : (
          <div className="space-y-14">
            {grouped.map((group) => (
              <section key={group.category.id} id={group.category.slug} className="scroll-mt-32">
                {!active ? (
                  <header className="mb-6">
                    <h2 className="font-[family-name:--font-display] text-2xl font-semibold tracking-tight text-espresso-900">
                      {group.category.name}
                    </h2>
                    {group.category.description ? (
                      <p className="mt-1 text-sm text-espresso-400">{group.category.description}</p>
                    ) : null}
                  </header>
                ) : null}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((item, index) => (
                    <MenuCard key={item.id} item={item} currency={currency} priority={index < 4} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: 'Home', url: '/' },
            { name: 'Menu', url: '/menu' },
            ...(active ? [{ name: active.name, url: `/menu?category=${active.slug}` }] : []),
          ],
          baseUrl,
        )}
      />
    </>
  );
}
