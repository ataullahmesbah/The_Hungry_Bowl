import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getSeoGlobal, getSettings } from '@/lib/settings';
import { getReviewSummary } from '@/lib/public/queries';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { JsonLd, restaurantJsonLd } from '@/lib/seo/structured-data';

export const revalidate = 60;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, seo, rating] = await Promise.all([
    getSettings(),
    getSeoGlobal(),
    getReviewSummary().catch(() => ({ average: 0, count: 0 })),
  ]);

  if (settings.maintenanceMode) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-espresso-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to content
      </a>

      <SiteHeader
        restaurantName={settings.name}
        logoUrl={settings.logoUrl}
        phone={settings.phone}
        reservationsEnabled={settings.reservationsEnabled}
      />

      <main id="main">{children}</main>

      <SiteFooter settings={settings} />

      <JsonLd data={restaurantJsonLd(settings, baseUrl, rating)} />

      {/* Analytics is opt-in from the SEO settings screen — no ID, no script. */}
      {seo.gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${seo.gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${seo.gaMeasurementId}',{anonymize_ip:true});`}
          </Script>
        </>
      ) : null}

      {seo.clarityProjectId ? (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${seo.clarityProjectId}");`}
        </Script>
      ) : null}
    </>
  );
}
