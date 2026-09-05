import type { RestaurantSettings } from '@prisma/client';

interface OpeningHour {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

const SCHEMA_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/**
 * Restaurant / LocalBusiness JSON-LD, PRD §18.
 *
 * The NAP block (name, address, phone) comes straight from settings so the
 * markup, the footer and the Google Business Profile can never drift apart —
 * consistency is what local ranking actually rewards.
 */
export function restaurantJsonLd(
  settings: RestaurantSettings,
  baseUrl: string,
  rating?: { average: number; count: number },
) {
  const hours = Array.isArray(settings.openingHours) ? (settings.openingHours as unknown as OpeningHour[]) : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${baseUrl}/#restaurant`,
    name: settings.name,
    ...(settings.legalName ? { legalName: settings.legalName } : {}),
    ...(settings.description ? { description: settings.description } : {}),
    url: baseUrl,
    ...(settings.logoUrl ? { logo: settings.logoUrl, image: settings.logoUrl } : {}),
    ...(settings.phone ? { telephone: settings.phone } : {}),
    ...(settings.email ? { email: settings.email } : {}),
    ...(settings.priceRange ? { priceRange: settings.priceRange } : {}),
    ...(settings.cuisines.length ? { servesCuisine: settings.cuisines } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(settings.addressLine1 ? { streetAddress: [settings.addressLine1, settings.addressLine2].filter(Boolean).join(', ') } : {}),
      ...(settings.city ? { addressLocality: settings.city } : {}),
      ...(settings.state ? { addressRegion: settings.state } : {}),
      ...(settings.postalCode ? { postalCode: settings.postalCode } : {}),
      addressCountry: settings.countryCode,
    },
    ...(settings.latitude && settings.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: Number(settings.latitude),
            longitude: Number(settings.longitude),
          },
        }
      : {}),
    ...(hours.length
      ? {
          openingHoursSpecification: hours
            .filter((h) => !h.closed)
            .map((h) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.day]}`,
              opens: h.open,
              closes: h.close,
            })),
        }
      : {}),
    ...(settings.reservationsEnabled
      ? {
          acceptsReservations: `${baseUrl}/reservation`,
          potentialAction: {
            '@type': 'ReserveAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${baseUrl}/reservation`,
              inLanguage: settings.locale,
            },
            result: { '@type': 'FoodEstablishmentReservation', name: `Reserve a table at ${settings.name}` },
          },
        }
      : {}),
    hasMenu: `${baseUrl}/menu`,
    // Only emitted when real approved reviews exist — Google penalises
    // aggregate ratings with no visible reviews behind them.
    ...(rating && rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.average.toFixed(1),
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    sameAs: [settings.facebookUrl, settings.instagramUrl, settings.youtubeUrl, settings.googleBusinessUrl].filter(
      Boolean,
    ),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[], baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.url}`,
    })),
  };
}

export function menuItemJsonLd(
  item: {
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    priceDisplayMode: string;
    basePrice: unknown;
    isVegetarian: boolean;
    calories: number | null;
    variants: { name: string; price: unknown }[];
    media: { media: { secureUrl: string } }[];
  },
  currencyCode: string,
  baseUrl: string,
) {
  const prices = item.variants.map((v) => Number(v.price)).filter((p) => p > 0);
  const showPrice = item.priceDisplayMode !== 'HIDDEN' && prices.length > 0;

  return {
    '@context': 'https://schema.org',
    '@type': 'MenuItem',
    name: item.name,
    url: `${baseUrl}/menu/${item.slug}`,
    description: item.description ?? item.shortDescription ?? undefined,
    ...(item.media.length ? { image: item.media.map((m) => m.media.secureUrl) } : {}),
    ...(item.isVegetarian ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}),
    ...(item.calories ? { nutrition: { '@type': 'NutritionInformation', calories: `${item.calories} cal` } } : {}),
    ...(showPrice
      ? {
          offers: item.variants
            .filter((v) => Number(v.price) > 0)
            .map((v) => ({
              '@type': 'Offer',
              name: v.name,
              price: Number(v.price).toFixed(2),
              priceCurrency: currencyCode,
              availability: 'https://schema.org/InStock',
            })),
        }
      : {}),
  };
}

export function eventJsonLd(
  event: { title: string; slug: string; description: string | null; startsAt: Date; endsAt: Date | null; venue: string | null; imageUrl: string | null },
  settings: RestaurantSettings,
  baseUrl: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.startsAt.toISOString(),
    ...(event.endsAt ? { endDate: event.endsAt.toISOString() } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.description ? { description: event.description } : {}),
    ...(event.imageUrl ? { image: event.imageUrl } : {}),
    url: `${baseUrl}/events`,
    location: {
      '@type': 'Place',
      name: event.venue || settings.name,
      address: {
        '@type': 'PostalAddress',
        ...(settings.addressLine1 ? { streetAddress: settings.addressLine1 } : {}),
        ...(settings.city ? { addressLocality: settings.city } : {}),
        addressCountry: settings.countryCode,
      },
    },
    organizer: { '@type': 'Organization', name: settings.name, url: baseUrl },
  };
}

/** Render helper — JSON-LD must be injected as a script tag, not as text. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own database rows, not user HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
