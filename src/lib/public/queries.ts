import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';

/**
 * Read helpers for the anonymous public website.
 *
 * Every query here is scoped to PUBLISHED, non-deleted rows. Draft content and
 * internal fields must never leak to an unauthenticated visitor, so the public
 * pages call these instead of hitting Prisma directly.
 */

/**
 * Public pages are statically generated, so these queries also run at build
 * time. A transient database problem during a deploy should degrade one
 * section to empty rather than abort the whole build — the page revalidates
 * with real content on the first request afterwards.
 */
async function safe<T>(run: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[public:${label}] query failed, using fallback`, error);
    return fallback;
  }
}

const publicItemSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  isAvailable: true,
  isFeatured: true,
  isTodaysSpecial: true,
  isNew: true,
  isVegetarian: true,
  isVegan: true,
  spiceLevel: true,
  prepMinutes: true,
  priceDisplayMode: true,
  basePrice: true,
  category: { select: { name: true, slug: true } },
  variants: {
    where: { isAvailable: true },
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, name: true, price: true, isAvailable: true, portionLabel: true },
  },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { media: { select: { secureUrl: true, altText: true } } },
  },
};

export const getPublishedCategories = cache(async () =>
  safe(
    () =>
      prisma.menuCategory.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imageUrl: true,
          isFeatured: true,
          _count: { select: { items: { where: { status: 'PUBLISHED', deletedAt: null } } } },
        },
      }),
    [],
    'categories',
  ),
);

export const getPublishedItems = cache(async (options?: { categorySlug?: string; take?: number }) =>
  safe(
    () =>
      prisma.menuItem.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          ...(options?.categorySlug ? { category: { slug: options.categorySlug } } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...(options?.take ? { take: options.take } : {}),
        select: publicItemSelect,
      }),
    [],
    'items',
  ),
);

export type PublicMenuItem = Awaited<ReturnType<typeof getPublishedItems>>[number];

export const getFeaturedItems = cache(async (take = 6) =>
  safe(
    () =>
      prisma.menuItem.findMany({
        where: { status: 'PUBLISHED', deletedAt: null, isFeatured: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take,
        select: publicItemSelect,
      }),
    [],
    'featured',
  ),
);

export const getTodaysSpecials = cache(async (take = 4) =>
  safe(
    () =>
      prisma.menuItem.findMany({
        where: { status: 'PUBLISHED', deletedAt: null, isTodaysSpecial: true },
        orderBy: { name: 'asc' },
        take,
        select: publicItemSelect,
      }),
    [],
    'specials',
  ),
);

export const getItemBySlug = cache(async (slug: string) =>
  safe(
    () =>
      prisma.menuItem.findFirst({
        where: { slug, status: 'PUBLISHED', deletedAt: null },
        select: {
          ...publicItemSelect,
          description: true,
          allergens: true,
          calories: true,
          isHalal: true,
          metaTitle: true,
          metaDescription: true,
          updatedAt: true,
          media: {
            orderBy: { sortOrder: 'asc' as const },
            select: { media: { select: { secureUrl: true, altText: true, caption: true, type: true } } },
          },
          addOnGroups: {
            orderBy: { sortOrder: 'asc' as const },
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  selectionType: true,
                  addOns: {
                    where: { isAvailable: true },
                    orderBy: { sortOrder: 'asc' as const },
                    select: { id: true, name: true, price: true },
                  },
                },
              },
            },
          },
        },
      }),
    null,
    'item',
  ),
);

export const getActiveOffers = cache(async (take?: number) =>
  safe(
    () => {
      const now = new Date();
      return prisma.offer.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
        ...(take ? { take } : {}),
      });
    },
    [],
    'offers',
  ),
);

export const getUpcomingEvents = cache(async (take?: number) =>
  safe(
    () =>
      prisma.event.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          OR: [{ endsAt: { gte: new Date() } }, { startsAt: { gte: new Date() } }],
        },
        orderBy: { startsAt: 'asc' },
        ...(take ? { take } : {}),
      }),
    [],
    'events',
  ),
);

export const getApprovedReviews = cache(async (options?: { take?: number; featuredOnly?: boolean }) =>
  safe(
    () =>
      prisma.review.findMany({
        where: {
          status: 'APPROVED',
          deletedAt: null,
          ...(options?.featuredOnly ? { isFeatured: true } : {}),
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        ...(options?.take ? { take: options.take } : {}),
        select: {
          id: true,
          authorName: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          reply: true,
          repliedAt: true,
        },
      }),
    [],
    'reviews',
  ),
);

export const getReviewSummary = cache(async () =>
  safe(
    async () => {
      const result = await prisma.review.aggregate({
        where: { status: 'APPROVED', deletedAt: null },
        _avg: { rating: true },
        _count: true,
      });
      return { average: Number(result._avg.rating ?? 0), count: result._count };
    },
    { average: 0, count: 0 },
    'review-summary',
  ),
);

export const getGallery = cache(async (take?: number) =>
  safe(
    () =>
      prisma.galleryItem.findMany({
        where: { isPublished: true, media: { deletedAt: null } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        ...(take ? { take } : {}),
        select: {
          id: true,
          title: true,
          caption: true,
          media: { select: { secureUrl: true, altText: true, width: true, height: true, type: true } },
          album: { select: { name: true, slug: true } },
        },
      }),
    [],
    'gallery',
  ),
);

export const getPageBySlug = cache(async (slug: string) =>
  safe(
    () => prisma.page.findFirst({ where: { slug, status: 'PUBLISHED', deletedAt: null } }),
    null,
    'page',
  ),
);

export const getContentBlocks = cache(async (section: string) =>
  safe(
    async () => {
      const blocks = await prisma.contentBlock.findMany({
        where: { section, isEnabled: true },
        orderBy: { sortOrder: 'asc' },
      });
      return Object.fromEntries(blocks.map((b) => [b.key, b.data])) as Record<string, unknown>;
    },
    {} as Record<string, unknown>,
    'blocks',
  ),
);

export const getSeoEntry = cache(async (path: string) =>
  safe(() => prisma.seoEntry.findUnique({ where: { path } }), null, 'seo-entry'),
);
