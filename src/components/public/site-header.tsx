'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/menu', label: 'Menu' },
  { href: '/offers', label: 'Offers' },
  { href: '/events', label: 'Events' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader({
  restaurantName,
  logoUrl,
  phone,
  reservationsEnabled,
}: {
  restaurantName: string;
  logoUrl: string | null;
  phone: string | null;
  reservationsEnabled: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors',
        scrolled ? 'border-espresso-100 bg-cream-50/95 backdrop-blur' : 'border-transparent bg-cream-50',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${restaurantName} home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-auto" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-espresso-900 text-sm font-bold text-saffron-400">
              HB
            </span>
          )}
          <span className="font-[family-name:--font-display] text-lg font-semibold tracking-tight text-espresso-900">
            {restaurantName}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'font-medium text-espresso-900'
                    : 'text-espresso-600 hover:bg-cream-200 hover:text-espresso-900',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-espresso-700 hover:bg-cream-200 sm:inline-flex"
            >
              <Phone className="h-3.5 w-3.5" />
              {phone}
            </a>
          ) : null}
          {reservationsEnabled ? (
            <Link
              href="/reservation"
              className="hidden rounded-lg bg-espresso-900 px-4 py-2 text-sm font-medium text-cream-50 transition-colors hover:bg-espresso-800 sm:inline-block"
            >
              Reserve a table
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-espresso-700 hover:bg-cream-200 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-espresso-100 bg-cream-50 lg:hidden">
          <nav className="mx-auto max-w-6xl px-4 py-3" aria-label="Mobile">
            <ul className="space-y-0.5">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-lg px-3 py-2.5 text-sm text-espresso-700 hover:bg-cream-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            {reservationsEnabled ? (
              <Link
                href="/reservation"
                className="mt-3 block rounded-lg bg-espresso-900 px-4 py-3 text-center text-sm font-medium text-cream-50"
              >
                Reserve a table
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
