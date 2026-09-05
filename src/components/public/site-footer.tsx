import Link from 'next/link';
import { Clock, Facebook, Instagram, Mail, MapPin, Phone, Youtube } from 'lucide-react';
import type { RestaurantSettings } from '@prisma/client';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface OpeningHour {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export function SiteFooter({ settings }: { settings: RestaurantSettings }) {
  const hours = Array.isArray(settings.openingHours) ? (settings.openingHours as unknown as OpeningHour[]) : [];

  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <footer className="mt-20 border-t border-espresso-100 bg-espresso-900 text-cream-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-saffron-500 text-sm font-bold text-espresso-950">
              HB
            </span>
            <span className="font-[family-name:--font-display] text-lg font-semibold text-cream-50">
              {settings.name}
            </span>
          </div>
          {settings.tagline ? <p className="mt-3 text-sm text-cream-300">{settings.tagline}</p> : null}

          <div className="mt-5 flex gap-2">
            {settings.facebookUrl ? (
              <a href={settings.facebookUrl} target="_blank" rel="noreferrer noopener" aria-label="Facebook" className="rounded-lg bg-espresso-800 p-2 hover:bg-espresso-700">
                <Facebook className="h-4 w-4" />
              </a>
            ) : null}
            {settings.instagramUrl ? (
              <a href={settings.instagramUrl} target="_blank" rel="noreferrer noopener" aria-label="Instagram" className="rounded-lg bg-espresso-800 p-2 hover:bg-espresso-700">
                <Instagram className="h-4 w-4" />
              </a>
            ) : null}
            {settings.youtubeUrl ? (
              <a href={settings.youtubeUrl} target="_blank" rel="noreferrer noopener" aria-label="YouTube" className="rounded-lg bg-espresso-800 p-2 hover:bg-espresso-700">
                <Youtube className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-cream-50">Explore</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              { href: '/menu', label: 'Full menu' },
              { href: '/offers', label: 'Offers & promotions' },
              { href: '/events', label: 'Events' },
              { href: '/gallery', label: 'Gallery' },
              { href: '/reviews', label: 'Customer reviews' },
              { href: '/about', label: 'About us' },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-cream-300 transition-colors hover:text-saffron-300">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-cream-50">Find us</h2>
          <ul className="mt-4 space-y-3 text-sm text-cream-300">
            {address ? (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" />
                <span>{address}</span>
              </li>
            ) : null}
            {settings.phone ? (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" />
                <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="hover:text-saffron-300">
                  {settings.phone}
                </a>
              </li>
            ) : null}
            {settings.email ? (
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" />
                <a href={`mailto:${settings.email}`} className="hover:text-saffron-300">
                  {settings.email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-cream-50">
            <Clock className="h-4 w-4 text-saffron-400" />
            Opening hours
          </h2>
          {hours.length > 0 ? (
            <ul className="mt-4 space-y-1.5 text-sm text-cream-300">
              {hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-4">
                  <span>{DAY_NAMES[h.day]}</span>
                  <span className="tabular-nums">{h.closed ? 'Closed' : `${h.open} – ${h.close}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-cream-300">Please call us for today’s hours.</p>
          )}
        </div>
      </div>

      <div className="border-t border-espresso-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-cream-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {settings.legalName || settings.name}. All rights reserved.
          </p>
          <nav className="flex flex-wrap gap-4" aria-label="Legal">
            <Link href="/privacy-policy" className="hover:text-saffron-300">Privacy</Link>
            <Link href="/terms" className="hover:text-saffron-300">Terms</Link>
            <Link href="/reservation-policy" className="hover:text-saffron-300">Reservation policy</Link>
            <Link href="/login" className="hover:text-saffron-300">Staff login</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
