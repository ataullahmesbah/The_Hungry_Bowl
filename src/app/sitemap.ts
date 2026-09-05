import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export const revalidate = 3600;

/**
 * Sitemap built from published content, with per-route priority and change
 * frequency taken from the SEO rows an owner can edit in the dashboard.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const staticPaths = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' as const },
    { path: '/menu', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/offers', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/events', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: '/gallery', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/reviews', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: '/reservation', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/contact', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  try {
    const [seoEntries, items, categories, pages] = await Promise.all([
      prisma.seoEntry.findMany({ where: { noIndex: false } }),
      prisma.menuItem.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        select: { slug: true, updatedAt: true },
      }),
      prisma.menuCategory.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        select: { slug: true, updatedAt: true },
      }),
      prisma.page.findMany({
        where: { status: 'PUBLISHED', deletedAt: null, noIndex: false },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const seoByPath = new Map(seoEntries.map((e) => [e.path, e]));
    const excluded = new Set(
      (await prisma.seoEntry.findMany({ where: { noIndex: true }, select: { path: true } })).map((e) => e.path),
    );

    const entries: MetadataRoute.Sitemap = [];

    for (const item of staticPaths) {
      if (excluded.has(item.path)) continue;
      const seo = seoByPath.get(item.path);
      entries.push({
        url: `${baseUrl}${item.path === '/' ? '' : item.path}`,
        lastModified: seo?.updatedAt ?? new Date(),
        changeFrequency: (seo?.changeFreq as MetadataRoute.Sitemap[number]['changeFrequency']) ?? item.changeFrequency,
        priority: seo?.priority ?? item.priority,
      });
    }

    for (const category of categories) {
      entries.push({
        url: `${baseUrl}/menu?category=${category.slug}`,
        lastModified: category.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }

    for (const item of items) {
      entries.push({
        url: `${baseUrl}/menu/${item.slug}`,
        lastModified: item.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    for (const page of pages) {
      entries.push({
        url: `${baseUrl}/${page.slug}`,
        lastModified: page.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }

    return entries;
  } catch {
    // A database hiccup must not return a 500 to a crawler.
    return staticPaths.map((item) => ({
      url: `${baseUrl}${item.path === '/' ? '' : item.path}`,
      lastModified: new Date(),
      changeFrequency: item.changeFrequency,
      priority: item.priority,
    }));
  }
}
