import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck, Clock, Info, Phone, Users } from 'lucide-react';
import { getSettings } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo/metadata';
import { ReservationForm } from './reservation-form';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return buildMetadata({
    path: '/reservation',
    fallbackTitle: 'Reserve a Table',
    fallbackDescription: `Book a table at ${settings.name}. Free reservation — no card and no online payment needed.`,
  });
}

export default async function ReservationPage() {
  const settings = await getSettings();

  if (!settings.reservationsEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-[family-name:--font-display] text-3xl font-semibold text-espresso-900">
          Reservations are closed online
        </h1>
        <p className="mt-3 text-espresso-400">
          Please call us{settings.phone ? ` on ${settings.phone}` : ''} and we will find you a table.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-espresso-100 bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="font-[family-name:--font-display] text-3xl font-semibold tracking-tight text-espresso-900 sm:text-4xl">
            Reserve a table
          </h1>
          <p className="mt-2 max-w-2xl text-espresso-400">
            Tell us when you are coming and we will hold a table for you. No payment is taken online — you settle the
            bill at the restaurant.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-[--radius-card] border border-espresso-100 bg-white p-6 sm:p-8">
          <ReservationForm
            maxGuests={settings.reservationMaxGuests}
            leadHours={settings.reservationLeadHours}
            phoneCode={settings.phoneCountryCode}
          />
        </div>

        <aside className="space-y-5">
          <div className="rounded-[--radius-card] border border-espresso-100 bg-cream-100 p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-espresso-900">
              <Info className="h-4 w-4 text-saffron-600" />
              How it works
            </h2>
            <ol className="mt-3 space-y-3 text-sm text-espresso-600">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-espresso-900 text-[11px] font-semibold text-cream-50">
                  1
                </span>
                Send your request with the date, time and number of guests.
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-espresso-900 text-[11px] font-semibold text-cream-50">
                  2
                </span>
                We check the floor plan and confirm by phone.
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-espresso-900 text-[11px] font-semibold text-cream-50">
                  3
                </span>
                Arrive and give your name — the table is ready.
              </li>
            </ol>
          </div>

          <div className="rounded-[--radius-card] border border-espresso-100 p-6">
            <ul className="space-y-3 text-sm text-espresso-600">
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
                We hold a reserved table for 20 minutes past the booking time.
              </li>
              <li className="flex gap-2.5">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
                For parties over {settings.reservationMaxGuests}, please call us directly.
              </li>
              <li className="flex gap-2.5">
                <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
                Book at least {settings.reservationLeadHours} hour{settings.reservationLeadHours === 1 ? '' : 's'} ahead.
              </li>
              {settings.phone ? (
                <li className="flex gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-saffron-600" />
                  <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="hover:text-saffron-700">
                    {settings.phone}
                  </a>
                </li>
              ) : null}
            </ul>
            <Link href="/reservation-policy" className="mt-4 inline-block text-xs text-saffron-700 hover:underline">
              Read the full reservation policy
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
