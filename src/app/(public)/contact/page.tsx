import type { Metadata } from 'next';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo/metadata';

export const revalidate = 300;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface OpeningHour {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const where = [settings.city, settings.countryName].filter(Boolean).join(', ');
  return buildMetadata({
    path: '/contact',
    fallbackTitle: 'Contact & Location',
    fallbackDescription: `Address, phone number, opening hours and directions to ${settings.name}${where ? ` in ${where}` : ''}.`,
  });
}

export default async function ContactPage() {
  const settings = await getSettings();
  const hours = Array.isArray(settings.openingHours) ? (settings.openingHours as unknown as OpeningHour[]) : [];
  const today = new Date().getDay();

  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.countryName,
  ]
    .filter(Boolean)
    .join(', ');

  const directionsUrl = settings.latitude && settings.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${settings.latitude},${settings.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${settings.name} ${address}`)}`;

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Contact &amp; location
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">
            Call us for large groups or anything the website does not answer.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-espresso-400">Get in touch</h2>
            <ul className="mt-4 space-y-4">
              {address ? (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
                  <div>
                    <p className="text-espresso-900">{address}</p>
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-block text-sm text-saffron-700 hover:underline"
                    >
                      Get directions
                    </a>
                  </div>
                </li>
              ) : null}

              {settings.phone ? (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
                  <div>
                    <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="text-espresso-900 hover:text-saffron-700">
                      {settings.phone}
                    </a>
                    {settings.altPhone ? (
                      <p>
                        <a href={`tel:${settings.altPhone.replace(/\s/g, '')}`} className="text-sm text-espresso-400 hover:text-saffron-700">
                          {settings.altPhone}
                        </a>
                      </p>
                    ) : null}
                  </div>
                </li>
              ) : null}

              {settings.whatsapp ? (
                <li className="flex gap-3">
                  <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
                  <a
                    href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-espresso-900 hover:text-saffron-700"
                  >
                    WhatsApp us
                  </a>
                </li>
              ) : null}

              {settings.email ? (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-saffron-600" />
                  <a href={`mailto:${settings.email}`} className="text-espresso-900 hover:text-saffron-700">
                    {settings.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </section>

          {hours.length > 0 ? (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-espresso-400">
                <Clock className="h-4 w-4" />
                Opening hours
              </h2>
              <ul className="mt-4 divide-y divide-espresso-100 rounded-lg border border-espresso-100">
                {hours.map((h) => (
                  <li
                    key={h.day}
                    className={`flex justify-between px-4 py-2.5 text-sm ${h.day === today ? 'bg-saffron-50 font-medium' : ''}`}
                  >
                    <span className="text-espresso-700">
                      {DAY_NAMES[h.day]}
                      {h.day === today ? <span className="ml-2 text-xs text-saffron-700">Today</span> : null}
                    </span>
                    <span className="tabular-nums text-espresso-900">
                      {h.closed ? 'Closed' : `${h.open} – ${h.close}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div>
          {settings.mapEmbedUrl ? (
            <iframe
              src={settings.mapEmbedUrl}
              title={`Map showing ${settings.name}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[420px] w-full rounded-[--radius-card] border border-espresso-100"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-[--radius-card] border border-dashed border-espresso-200 bg-cream-100 text-center text-sm text-espresso-400">
              <p className="max-w-xs px-6">
                A map will appear here once the location is added in the dashboard settings.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
