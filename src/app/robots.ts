import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  let allowIndexing = true;
  try {
    const seo = await prisma.seoGlobal.findUnique({ where: { id: 'singleton' } });
    allowIndexing = seo?.allowIndexing ?? true;
  } catch {
    allowIndexing = false; // fail closed rather than index a broken deployment
  }

  if (!allowIndexing) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Staff areas and API endpoints have nothing a crawler should index.
        disallow: ['/dashboard', '/dashboard/', '/kds', '/kds/', '/api/', '/login'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
