import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { Prisma, type RestaurantSettings, type SeoGlobal } from '@prisma/client';

/**
 * Country, currency, locale and timezone all live in this row. Nothing in the
 * codebase hardcodes Bangladesh, so reselling the platform to a restaurant in
 * another country is a settings change, not a code change.
 */
export const DEFAULT_SETTINGS = {
  id: 'singleton',
  name: 'The Hungry Bowl',
  countryCode: 'BD',
  countryName: 'Bangladesh',
  currencyCode: 'BDT',
  currencySymbol: '৳',
  currencyPosition: 'before',
  currencyDecimals: 2,
  locale: 'en-BD',
  timezone: 'Asia/Dhaka',
  phoneCountryCode: '+880',
} as const;

/**
 * Settings must never be the reason a deploy fails.
 *
 * Public pages are statically generated, so they read this at build time. If
 * the database is briefly unreachable during a build, falling back to sane
 * defaults lets the build finish and the page revalidate with real values on
 * the first request, instead of aborting the whole deployment.
 */
export const getSettings = cache(async (): Promise<RestaurantSettings> => {
  try {
    const existing = await prisma.restaurantSettings.findUnique({ where: { id: 'singleton' } });
    if (existing) return existing;
    return await prisma.restaurantSettings.create({ data: { id: 'singleton' } });
  } catch (error) {
    console.error('[settings] falling back to defaults', error);
    return fallbackSettings();
  }
});

export const getSeoGlobal = cache(async (): Promise<SeoGlobal> => {
  try {
    const existing = await prisma.seoGlobal.findUnique({ where: { id: 'singleton' } });
    if (existing) return existing;
    return await prisma.seoGlobal.create({ data: { id: 'singleton' } });
  } catch (error) {
    console.error('[seo] falling back to defaults', error);
    return fallbackSeo();
  }
});

function fallbackSettings(): RestaurantSettings {
  return {
    id: 'singleton',
    name: DEFAULT_SETTINGS.name,
    legalName: null,
    tagline: null,
    description: null,
    logoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    countryCode: DEFAULT_SETTINGS.countryCode,
    countryName: DEFAULT_SETTINGS.countryName,
    currencyCode: DEFAULT_SETTINGS.currencyCode,
    currencySymbol: DEFAULT_SETTINGS.currencySymbol,
    currencyPosition: DEFAULT_SETTINGS.currencyPosition,
    currencyDecimals: DEFAULT_SETTINGS.currencyDecimals,
    locale: DEFAULT_SETTINGS.locale,
    timezone: DEFAULT_SETTINGS.timezone,
    phoneCountryCode: DEFAULT_SETTINGS.phoneCountryCode,
    taxPercent: new Prisma.Decimal(0),
    taxLabel: 'VAT',
    taxRegNumber: null,
    serviceChargePercent: new Prisma.Decimal(0),
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    phone: null,
    altPhone: null,
    email: null,
    whatsapp: null,
    mapEmbedUrl: null,
    googleBusinessUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    youtubeUrl: null,
    tiktokUrl: null,
    cuisines: [],
    priceRange: null,
    openingHours: null,
    reservationsEnabled: true,
    reservationLeadHours: 2,
    reservationMaxGuests: 20,
    reviewsEnabled: true,
    reviewsRequireApproval: true,
    orderNumberPrefix: '',
    orderNumberDailyReset: true,
    kdsSoundEnabled: true,
    lowStockAlertEnabled: true,
    maintenanceMode: false,
    updatedAt: new Date(),
    updatedBy: null,
  };
}

function fallbackSeo(): SeoGlobal {
  return {
    id: 'singleton',
    siteName: DEFAULT_SETTINGS.name,
    titleTemplate: `%s | ${DEFAULT_SETTINGS.name}`,
    defaultTitle: DEFAULT_SETTINGS.name,
    defaultDescription: null,
    defaultOgImageUrl: null,
    twitterHandle: null,
    googleSiteVerification: null,
    bingSiteVerification: null,
    gaMeasurementId: null,
    gtmContainerId: null,
    clarityProjectId: null,
    facebookPixelId: null,
    robotsExtra: null,
    allowIndexing: true,
    updatedAt: new Date(),
    updatedBy: null,
  };
}

/** Shape safe to hand to client components — no internal flags. */
export interface PublicSettings {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  currencyCode: string;
  currencySymbol: string;
  currencyPosition: string;
  currencyDecimals: number;
  locale: string;
  timezone: string;
  countryCode: string;
  phoneCountryCode: string;
  taxPercent: number;
  taxLabel: string;
  serviceChargePercent: number;
}

export function toPublicSettings(s: RestaurantSettings): PublicSettings {
  return {
    name: s.name,
    tagline: s.tagline,
    logoUrl: s.logoUrl,
    currencyCode: s.currencyCode,
    currencySymbol: s.currencySymbol,
    currencyPosition: s.currencyPosition,
    currencyDecimals: s.currencyDecimals,
    locale: s.locale,
    timezone: s.timezone,
    countryCode: s.countryCode,
    phoneCountryCode: s.phoneCountryCode,
    taxPercent: Number(s.taxPercent),
    taxLabel: s.taxLabel,
    serviceChargePercent: Number(s.serviceChargePercent),
  };
}
