import 'server-only';
import type { Metadata } from 'next';
import { getSeoEntry } from '@/lib/public/queries';
import { getSeoGlobal, getSettings } from '@/lib/settings';

interface BuildOptions {
  path: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  image?: string | null;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

/**
 * Page metadata, merged in this order: per-route SEO row (editable in the
 * dashboard) → values the page itself supplies → global defaults.
 *
 * `allowIndexing` on the global row is a hard switch: a staging deployment can
 * be kept out of Google without touching any page.
 */
export async function buildMetadata(options: BuildOptions): Promise<Metadata> {
  const [entry, global, settings] = await Promise.all([
    getSeoEntry(options.path).catch(() => null),
    getSeoGlobal().catch(() => null),
    getSettings().catch(() => null),
  ]);

  const siteName = global?.siteName || settings?.name || 'The Hungry Bowl';
  const title = entry?.title || options.fallbackTitle || global?.defaultTitle || siteName;
  const description =
    entry?.description || options.fallbackDescription || global?.defaultDescription || undefined;
  const image = entry?.ogImageUrl || options.image || global?.defaultOgImageUrl || settings?.ogImageUrl || undefined;

  const indexable = (global?.allowIndexing ?? true) && !entry?.noIndex && !options.noIndex;

  return {
    title,
    description,
    keywords: entry?.keywords || undefined,
    alternates: { canonical: entry?.canonicalUrl || options.path },
    robots: indexable
      ? { index: true, follow: !entry?.noFollow, googleBot: { index: true, follow: !entry?.noFollow } }
      : { index: false, follow: false },
    openGraph: {
      type: options.type ?? 'website',
      siteName,
      title: entry?.ogTitle || title,
      description: entry?.ogDescription || description,
      url: options.path,
      locale: (settings?.locale || 'en_BD').replace('-', '_'),
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      site: global?.twitterHandle || undefined,
      title: entry?.ogTitle || title,
      description: entry?.ogDescription || description,
      ...(image ? { images: [image] } : {}),
    },
    verification: {
      google: global?.googleSiteVerification || undefined,
      other: global?.bingSiteVerification ? { 'msvalidate.01': global.bingSiteVerification } : undefined,
    },
  };
}
