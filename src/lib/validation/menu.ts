import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only');

export const publishStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const categoryInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  slug: slugSchema,
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: publishStatusSchema.default('PUBLISHED'),
  isFeatured: z.boolean().default(false),
  metaTitle: z.string().max(160).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
});

export const variantInputSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1, 'Size name is required').max(80),
  code: z.string().max(10).nullable().optional(),
  price: z.number().min(0, 'Price cannot be negative').max(9_999_999),
  compareAtPrice: z.number().min(0).max(9_999_999).nullable().optional(),
  isAvailable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  portionLabel: z.string().max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const menuItemInputSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(160),
    slug: slugSchema,
    categoryId: z.string().cuid('Choose a category'),
    shortDescription: z.string().max(300).nullable().optional(),
    description: z.string().max(6000).nullable().optional(),

    status: publishStatusSchema.default('PUBLISHED'),
    isAvailable: z.boolean().default(true),

    isFeatured: z.boolean().default(false),
    isTodaysSpecial: z.boolean().default(false),
    isNew: z.boolean().default(false),

    priceDisplayMode: z.enum(['FIXED', 'RANGE', 'HIDDEN']).default('FIXED'),
    basePrice: z.number().min(0).max(9_999_999).nullable().optional(),

    isVegetarian: z.boolean().default(false),
    isVegan: z.boolean().default(false),
    isHalal: z.boolean().default(true),
    spiceLevel: z.number().int().min(0).max(4).default(0),
    allergens: z.array(z.string().max(40)).max(20).default([]),
    calories: z.number().int().min(0).max(20000).nullable().optional(),
    prepMinutes: z.number().int().min(0).max(600).nullable().optional(),

    sortOrder: z.number().int().min(0).max(9999).default(0),

    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    metaKeywords: z.string().max(300).nullable().optional(),

    variants: z.array(variantInputSchema).min(1, 'Add at least one size or variant').max(20),
    addOnGroupIds: z.array(z.string().cuid()).max(20).default([]),
    mediaIds: z.array(z.string().cuid()).max(12).default([]),
  })
  .superRefine((value, ctx) => {
    // A hidden price must not silently fall back to a zero price on the site.
    if (value.priceDisplayMode === 'FIXED' && value.variants.length === 0 && (value.basePrice ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['basePrice'],
        message: 'A fixed-price item needs a price above zero, or switch the display mode to Hidden.',
      });
    }
    if (value.priceDisplayMode === 'RANGE' && value.variants.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceDisplayMode'],
        message: 'A price range needs at least two sizes. Add another size or choose Fixed.',
      });
    }
    const defaults = value.variants.filter((v) => v.isDefault);
    if (defaults.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Only one size can be the default.',
      });
    }
  });

export const addOnSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().min(1, 'Name is required').max(80),
  price: z.number().min(0).max(999_999).default(0),
  isAvailable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const addOnGroupInputSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    description: z.string().max(400).nullable().optional(),
    selectionType: z.enum(['SINGLE', 'MULTIPLE']).default('MULTIPLE'),
    isRequired: z.boolean().default(false),
    minSelect: z.number().int().min(0).max(20).default(0),
    maxSelect: z.number().int().min(1).max(20).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).default(0),
    addOns: z.array(addOnSchema).min(1, 'Add at least one option').max(30),
  })
  .superRefine((value, ctx) => {
    if (value.maxSelect != null && value.maxSelect < value.minSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'Maximum cannot be lower than minimum.',
      });
    }
    if (value.selectionType === 'SINGLE' && (value.maxSelect ?? 1) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'A single-choice group can allow at most one selection.',
      });
    }
  });

export const availabilityInputSchema = z.object({
  isAvailable: z.boolean(),
  reason: z.string().max(200).nullable().optional(),
  variantId: z.string().cuid().nullable().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type MenuItemInput = z.infer<typeof menuItemInputSchema>;
export type AddOnGroupInput = z.infer<typeof addOnGroupInputSchema>;
