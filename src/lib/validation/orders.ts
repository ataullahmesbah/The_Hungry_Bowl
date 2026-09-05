import { z } from 'zod';

export const orderLineSchema = z.object({
  menuItemId: z.string().cuid('Choose a menu item'),
  variantId: z.string().cuid().nullable().optional(),
  quantity: z.number().int().min(1, 'At least one').max(99, 'That is a very large quantity — split the order'),
  addOnIds: z.array(z.string().cuid()).max(20).default([]),
  note: z.string().max(300).nullable().optional(),
});

export const createOrderSchema = z
  .object({
    /** Dine-in orders belong to a table session; takeaway does not. */
    sessionId: z.string().cuid().nullable().optional(),
    tableId: z.string().cuid().nullable().optional(),
    customerId: z.string().cuid().nullable().optional(),
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
    guestName: z.string().max(120).nullable().optional(),
    guestPhone: z.string().max(24).nullable().optional(),
    guestCount: z.number().int().min(1).max(60).default(1),
    note: z.string().max(1000).nullable().optional(),
    lines: z.array(orderLineSchema).min(1, 'Add at least one item').max(100),
    /** Send straight to the kitchen instead of leaving it as a draft. */
    sendToKitchen: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'DINE_IN' && !value.sessionId && !value.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionId'],
        message: 'Choose the table the guests are sitting at.',
      });
    }
  });

export const addLinesSchema = z.object({
  lines: z.array(orderLineSchema).min(1).max(100),
  sendToKitchen: z.boolean().default(true),
});

export const updateOrderSchema = z.object({
  note: z.string().max(1000).nullable().optional(),
  guestName: z.string().max(120).nullable().optional(),
  guestPhone: z.string().max(24).nullable().optional(),
  customerId: z.string().cuid().nullable().optional(),
});

export const discountSchema = z.object({
  discountAmount: z.number().min(0).max(9_999_999),
  discountReason: z.string().max(200).nullable().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']),
  note: z.string().max(300).nullable().optional(),
});

export const cancelLineSchema = z.object({
  quantity: z.number().int().min(1).max(99),
  reason: z.string().max(200).nullable().optional(),
});

export const paymentSchema = z.object({
  orderId: z.string().cuid('Choose the order this payment is for'),
  methodId: z.string().cuid('Choose a payment method'),
  amount: z.number().min(0.01, 'Enter the amount received').max(9_999_999),
  /** Transaction / reference id from the terminal or the customer's SMS. */
  reference: z.string().max(120).nullable().optional(),
  /** Last four digits only — never a full card number. */
  maskedAccount: z
    .string()
    .max(8)
    .regex(/^[0-9]{0,8}$/, 'Enter digits only — at most the last 8')
    .nullable()
    .optional(),
  accountLabel: z.string().max(80).nullable().optional(),
  tipAmount: z.number().min(0).max(999_999).default(0),
  changeGiven: z.number().min(0).max(999_999).default(0),
  note: z.string().max(300).nullable().optional(),
});

export const refundSchema = z.object({
  amount: z.number().min(0.01).max(9_999_999),
  reason: z.string().min(3, 'Give a reason for the refund').max(300),
});

export const voidSchema = z.object({
  reason: z.string().min(3, 'Give a reason').max(300),
});

export const paymentMethodSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9_]+$/, 'Use capitals, numbers and underscores'),
  name: z.string().min(1, 'Name is required').max(60),
  kind: z.enum(['CASH', 'CARD', 'MOBILE', 'BANK', 'OTHER']).default('OTHER'),
  isActive: z.boolean().default(true),
  requiresReference: z.boolean().default(false),
  countryCode: z.string().length(2).nullable().optional(),
  instructions: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
