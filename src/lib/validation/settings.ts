import { z } from 'zod';
import { passwordSchema } from '@/lib/security/password';

const openingHourSchema = z.object({
  day: z.number().int().min(0).max(6),
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 11:00'),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 23:00'),
  closed: z.boolean(),
});

/**
 * Restaurant settings.
 *
 * The locale block (country, currency, timezone, tax) is what makes this
 * platform resellable: changing it here is all that is needed to run the same
 * code for a restaurant in another country.
 */
export const settingsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  legalName: z.string().max(200).nullable().optional(),
  tagline: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  ogImageUrl: z.string().url().nullable().optional(),

  countryCode: z.string().length(2, 'Use the two-letter country code').toUpperCase(),
  countryName: z.string().min(1).max(80),
  currencyCode: z.string().length(3, 'Use the three-letter currency code').toUpperCase(),
  currencySymbol: z.string().min(1).max(8),
  currencyPosition: z.enum(['before', 'after']),
  currencyDecimals: z.number().int().min(0).max(4),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(3).max(60),
  phoneCountryCode: z.string().min(1).max(8),

  taxPercent: z.number().min(0).max(100),
  taxLabel: z.string().min(1).max(20),
  taxRegNumber: z.string().max(60).nullable().optional(),
  serviceChargePercent: z.number().min(0).max(100),

  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(120).nullable().optional(),
  postalCode: z.string().max(24).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  altPhone: z.string().max(30).nullable().optional(),
  email: z.string().email('Enter a valid email').max(200).nullable().optional().or(z.literal('')),
  whatsapp: z.string().max(30).nullable().optional(),
  mapEmbedUrl: z.string().max(2000).nullable().optional(),
  googleBusinessUrl: z.string().url().max(500).nullable().optional().or(z.literal('')),

  facebookUrl: z.string().url().max(300).nullable().optional().or(z.literal('')),
  instagramUrl: z.string().url().max(300).nullable().optional().or(z.literal('')),
  youtubeUrl: z.string().url().max(300).nullable().optional().or(z.literal('')),
  tiktokUrl: z.string().url().max(300).nullable().optional().or(z.literal('')),

  cuisines: z.array(z.string().max(60)).max(20),
  priceRange: z.string().max(10).nullable().optional(),
  openingHours: z.array(openingHourSchema).max(7).nullable().optional(),

  reservationsEnabled: z.boolean(),
  reservationLeadHours: z.number().int().min(0).max(168),
  reservationMaxGuests: z.number().int().min(1).max(200),
  reviewsEnabled: z.boolean(),
  reviewsRequireApproval: z.boolean(),
  orderNumberPrefix: z.string().max(8),
  orderNumberDailyReset: z.boolean(),
  kdsSoundEnabled: z.boolean(),
  lowStockAlertEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
});

export const seoGlobalSchema = z.object({
  siteName: z.string().min(1).max(120),
  titleTemplate: z.string().min(1).max(120),
  defaultTitle: z.string().min(1).max(160),
  defaultDescription: z.string().max(320).nullable().optional(),
  defaultOgImageUrl: z.string().url().nullable().optional(),
  twitterHandle: z.string().max(40).nullable().optional(),
  googleSiteVerification: z.string().max(120).nullable().optional(),
  bingSiteVerification: z.string().max(120).nullable().optional(),
  gaMeasurementId: z
    .string()
    .max(30)
    .regex(/^(G-[A-Z0-9]+)?$/i, 'Looks like G-XXXXXXX')
    .nullable()
    .optional()
    .or(z.literal('')),
  gtmContainerId: z.string().max(30).nullable().optional(),
  clarityProjectId: z.string().max(40).nullable().optional(),
  facebookPixelId: z.string().max(40).nullable().optional(),
  robotsExtra: z.string().max(2000).nullable().optional(),
  allowIndexing: z.boolean(),
});

export const seoEntrySchema = z.object({
  path: z.string().min(1).max(200).startsWith('/', 'Paths start with /'),
  title: z.string().max(160).nullable().optional(),
  description: z.string().max(320).nullable().optional(),
  keywords: z.string().max(300).nullable().optional(),
  ogTitle: z.string().max(160).nullable().optional(),
  ogDescription: z.string().max(320).nullable().optional(),
  ogImageUrl: z.string().url().nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional().or(z.literal('')),
  noIndex: z.boolean().default(false),
  noFollow: z.boolean().default(false),
  priority: z.number().min(0).max(1).default(0.5),
  changeFreq: z.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).default('weekly'),
});

export const userCreateSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  email: z.string().email('Enter a valid email').max(200),
  password: passwordSchema,
  roleIds: z.array(z.string().cuid()).min(1, 'Give the user at least one role').max(5),
  phone: z.string().max(24).nullable().optional(),
  mustChangePassword: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(24).nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
  roleIds: z.array(z.string().cuid()).min(1).max(5).optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  mustChangePassword: z.boolean().default(true),
});

export const roleSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use capitals, numbers and underscores'),
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  rank: z.number().int().min(0).max(999).default(100),
  permissionKeys: z.array(z.string().max(60)).max(200),
});
