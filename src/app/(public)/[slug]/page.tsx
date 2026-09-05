import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getPageBySlug } from '@/lib/public/queries';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatDate } from '@/lib/format';
import { CldImage } from '@/components/public/cld-image';
import { sanitizeHtml } from '@/lib/security/sanitize';

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const pages = await prisma.page.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: { slug: true },
      take: 100,
    });
    return pages.map((page) => ({ slug: page.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return { title: 'Page not found' };

  return buildMetadata({
    path: `/${slug}`,
    fallbackTitle: page.metaTitle || page.title,
    fallbackDescription: page.metaDescription || page.excerpt || undefined,
    image: page.coverUrl,
    type: page.kind === 'post' ? 'article' : 'website',
    noIndex: page.noIndex,
  });
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const settings = await getSettings();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
          {page.title}
        </h1>
        {page.excerpt ? <p className="mt-3 text-lg text-espresso-400">{page.excerpt}</p> : null}
        {page.kind === 'post' && page.publishedAt ? (
          <p className="mt-3 text-sm text-espresso-400">
            {formatDate(page.publishedAt, settings.timezone, settings.locale)}
          </p>
        ) : null}
      </header>

      {page.coverUrl ? (
        <CldImage
          src={page.coverUrl}
          alt={page.title}
          aspect="16 / 9"
          priority
          sizes="(min-width: 768px) 768px, 100vw"
          className="mt-8"
        />
      ) : null}

      {/*
        Content comes from the dashboard editor and is sanitised on the server
        before it is rendered, so a compromised staff account cannot inject a
        script into a public page.
      */}
      <div
        className="prose-hb mt-8 text-espresso-700"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }}
      />
    </article>
  );
}
