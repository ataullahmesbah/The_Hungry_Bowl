import { z } from 'zod';

export const inventoryItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  sku: z.string().max(60).nullable().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  unitId: z.string().cuid('Choose a unit'),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
  reorderLevel: z.number().min(0).max(9_999_999).default(0),
  criticalLevel: z.number().min(0).max(9_999_999).default(0),
});

export const inventoryCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const warehouseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  kind: z.enum(['WAREHOUSE', 'KITCHEN', 'BAR', 'OTHER']).default('WAREHOUSE'),
  location: z.string().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
  isDefaultReceiving: z.boolean().default(false),
  isDefaultConsumption: z.boolean().default(false),
});

export const unitSchema = z.object({
  code: z.string().min(1).max(12),
  name: z.string().min(1).max(60),
  kind: z.enum(['WEIGHT', 'VOLUME', 'COUNT']).default('COUNT'),
  toBase: z.number().positive().max(1_000_000).default(1),
  isActive: z.boolean().default(true),
});

const quantity = z.number().positive('Enter a quantity above zero').max(9_999_999);

export const transferSchema = z.object({
  itemId: z.string().cuid('Choose an item'),
  fromWarehouseId: z.string().cuid('Choose where the stock is coming from'),
  toWarehouseId: z.string().cuid('Choose where it is going'),
  quantity,
  note: z.string().max(300).nullable().optional(),
});

export const consumptionSchema = z.object({
  itemId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity,
  reason: z.string().max(200).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export const wastageSchema = z.object({
  itemId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity,
  reason: z.string().min(2, 'Say what happened').max(200),
  note: z.string().max(300).nullable().optional(),
});

export const returnSchema = z.object({
  itemId: z.string().cuid(),
  fromWarehouseId: z.string().cuid(),
  toWarehouseId: z.string().cuid(),
  quantity,
  reason: z.string().max(200).nullable().optional(),
});

export const adjustmentSchema = z.object({
  itemId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  /** The counted quantity; the system works out the difference. */
  countedQuantity: z.number().min(0).max(9_999_999),
  reason: z.string().min(2, 'Give a reason for the adjustment').max(200),
  note: z.string().max(300).nullable().optional(),
});

export const openingStockSchema = z.object({
  itemId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity,
  unitCost: z.number().min(0).max(9_999_999).optional(),
  note: z.string().max(300).nullable().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  contactName: z.string().max(120).nullable().optional(),
  phone: z.string().max(24).nullable().optional(),
  email: z.string().email('Enter a valid email').max(200).nullable().optional().or(z.literal('')),
  address: z.string().max(300).nullable().optional(),
  taxNumber: z.string().max(60).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const purchaseItemSchema = z.object({
  itemId: z.string().cuid(),
  quantity,
  unitCost: z.number().min(0).max(9_999_999),
  note: z.string().max(200).nullable().optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.string().cuid().nullable().optional(),
  warehouseId: z.string().cuid('Choose which store receives this'),
  purchaseDate: z.string().datetime().optional(),
  invoiceNo: z.string().max(80).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  taxAmount: z.number().min(0).max(9_999_999).default(0),
  shippingCost: z.number().min(0).max(9_999_999).default(0),
  discountAmount: z.number().min(0).max(9_999_999).default(0),
  paidAmount: z.number().min(0).max(9_999_999).default(0),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one item').max(100),
  /** Receive straight into stock instead of leaving it as an order. */
  receiveNow: z.boolean().default(true),
});

export const receivePurchaseSchema = z.object({
  items: z
    .array(z.object({ purchaseItemId: z.string().cuid(), receivedQuantity: z.number().min(0).max(9_999_999) }))
    .min(1),
});
