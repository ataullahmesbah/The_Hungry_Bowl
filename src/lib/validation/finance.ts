import { z } from 'zod';

export const recipeIngredientSchema = z.object({
  id: z.string().cuid().optional(),
  itemId: z.string().cuid('Choose an ingredient'),
  quantity: z.number().positive('Enter how much is used').max(9_999_999),
  note: z.string().max(200).nullable().optional(),
  isOptional: z.boolean().default(false),
});

export const recipeSchema = z.object({
  variantId: z.string().cuid('Choose which size this recipe is for'),
  name: z.string().max(160).nullable().optional(),
  yieldQty: z.number().positive().max(10_000).default(1),
  isActive: z.boolean().default(true),
  /**
   * When off, completing an order does not deduct this variant's ingredients.
   * PRD §12 makes automatic consumption subject to manager configuration.
   */
  autoConsume: z.boolean().default(true),
  note: z.string().max(1000).nullable().optional(),
  ingredients: z.array(recipeIngredientSchema).min(1, 'Add at least one ingredient').max(60),
});

export const expenseCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  kind: z.enum(['FOOD', 'SALARY', 'UTILITY', 'RENT', 'MARKETING', 'MAINTENANCE', 'OTHER']).default('OTHER'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const expenseSchema = z.object({
  categoryId: z.string().cuid('Choose a category'),
  title: z.string().min(1, 'Say what this was for').max(200),
  amount: z.number().positive('Enter an amount above zero').max(99_999_999),
  expenseDate: z.string().datetime(),
  methodId: z.string().cuid().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  supplierId: z.string().cuid().nullable().optional(),
});

export const incomeSchema = z.object({
  title: z.string().min(1, 'Say what this was').max(200),
  kind: z.enum(['SALES', 'OTHER']).default('OTHER'),
  amount: z.number().positive().max(99_999_999),
  entryDate: z.string().datetime(),
  reference: z.string().max(120).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const closingSchema = z.object({
  /** Business date in the restaurant's own timezone: YYYY-MM-DD. */
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'),
  /** What was actually counted per method, keyed by payment method id. */
  countedByMethod: z.record(z.string().cuid(), z.number().min(0).max(99_999_999)).default({}),
  note: z.string().max(2000).nullable().optional(),
});

export const reportRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  preset: z.enum(['today', 'yesterday', 'week', 'month', 'year']).optional(),
});
