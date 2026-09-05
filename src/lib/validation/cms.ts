import { z } from 'zod';
import { slugSchema, publishStatusSchema } from './menu';

export const offerInputSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(160),
    slug: slugSchema,
    subtitle: z.string().max(240).nullable().optional(),
    description: z.string().max(4000).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'SPECIAL_PRICE', 'COMBO', 'INFO_ONLY']).default('INFO_ONLY'),
    value: z.number().min(0).max(9_999_999).nullable().optional(),
    couponCode: z.string().max(40).nullable().optional(),
    terms: z.string().max(2000).nullable().optional(),
    status: publishStatusSchema.default('PUBLISHED'),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    isFeatured: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'The end must come after the start.' });
    }
    if (value.type === 'PERCENTAGE' && value.value != null && value.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'A percentage cannot be above 100.' });
    }
    if (['PERCENTAGE', 'FIXED_AMOUNT', 'SPECIAL_PRICE'].includes(value.type) && value.value == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Enter the offer amount.' });
    }
  });

export const eventInputSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(160),
    slug: slugSchema,
    description: z.string().max(4000).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    startsAt: z.string().datetime('Choose a start date and time'),
    endsAt: z.string().datetime().nullable().optional(),
    venue: z.string().max(160).nullable().optional(),
    ticketInfo: z.string().max(500).nullable().optional(),
    status: publishStatusSchema.default('PUBLISHED'),
    isFeatured: z.boolean().default(false),
    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'The end must come after the start.' });
    }
  });

export const pageInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  slug: slugSchema,
  excerpt: z.string().max(500).nullable().optional(),
  content: z.string().max(80_000).default(''),
  coverUrl: z.string().url().nullable().optional(),
  status: publishStatusSchema.default('DRAFT'),
  kind: z.enum(['page', 'post', 'policy']).default('page'),
  metaTitle: z.string().max(160).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  metaKeywords: z.string().max(300).nullable().optional(),
  noIndex: z.boolean().default(false),
});

export const reviewModerationSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  isFeatured: z.boolean().optional(),
  reply: z.string().max(2000).nullable().optional(),
});

export const contentBlockSchema = z.object({
  data: z.record(z.unknown()),
  isEnabled: z.boolean().optional(),
});

export const galleryItemSchema = z.object({
  mediaIds: z.array(z.string().cuid()).min(1).max(50),
  albumId: z.string().cuid().nullable().optional(),
});

/** Reserved slugs that would collide with a real route. */
export const RESERVED_SLUGS = new Set([
  'menu', 'offers', 'events', 'gallery', 'reviews', 'reservation', 'contact',
  'dashboard', 'login', 'kds', 'api', 'sitemap', 'robots',
]);
