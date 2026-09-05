import { z } from 'zod';

/** Loose enough for any country's format; settings hold the dialling code. */
export const phoneSchema = z
  .string()
  .min(6, 'Enter a valid phone number')
  .max(24)
  .regex(/^[+0-9][0-9\s\-()]*$/, 'Use digits, spaces, dashes or a leading +');

export const customerInputSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  phone: phoneSchema.nullable().optional().or(z.literal('')),
  email: z.string().email('Enter a valid email').max(200).nullable().optional().or(z.literal('')),
  notes: z.string().max(2000).nullable().optional(),
  isBlacklisted: z.boolean().optional(),
});

export const tableAreaInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  floor: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const tableInputSchema = z.object({
  name: z.string().min(1, 'Table name is required').max(40),
  areaId: z.string().cuid().nullable().optional(),
  capacity: z.number().int().min(1, 'At least one seat').max(50).default(4),
  shape: z.enum(['square', 'round', 'rect']).default('square'),
  posX: z.number().int().min(0).max(5000).default(0),
  posY: z.number().int().min(0).max(5000).default(0),
  isActive: z.boolean().default(true),
  notes: z.string().max(300).nullable().optional(),
});

export const tableStatusSchema = z.object({
  status: z.enum(['FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE']),
});

/** Opening a session = seating a party. See the TableSession model comment. */
export const openSessionSchema = z.object({
  tableId: z.string().cuid('Choose a table'),
  guestCount: z.number().int().min(1, 'At least one guest').max(60).default(1),
  customerId: z.string().cuid().nullable().optional(),
  guestName: z.string().max(120).nullable().optional(),
  guestPhone: phoneSchema.nullable().optional().or(z.literal('')),
  reservationId: z.string().cuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const closeSessionSchema = z.object({
  /** Set the table to CLEANING instead of FREE when the party leaves. */
  markForCleaning: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
  /**
   * Closing with unpaid orders requires an explicit override, so a bill is
   * never lost simply by clearing a table.
   */
  forceWithUnpaid: z.boolean().default(false),
});

export const publicReservationSchema = z.object({
  name: z.string().min(2, 'Please tell us your name').max(120),
  phone: phoneSchema,
  email: z.string().email('Enter a valid email').max(200).optional().or(z.literal('')),
  guestCount: z.number().int().min(1, 'At least one guest').max(60),
  reservedAt: z.string().datetime('Choose a date and time'),
  note: z.string().max(1000).optional().or(z.literal('')),
  /** Honeypot. */
  company: z.string().max(0).optional(),
});

export const reservationStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
  tableId: z.string().cuid().nullable().optional(),
  internalNote: z.string().max(1000).nullable().optional(),
  cancelReason: z.string().max(300).nullable().optional(),
});

export const staffReservationSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  phone: phoneSchema,
  email: z.string().email().max(200).nullable().optional().or(z.literal('')),
  guestCount: z.number().int().min(1).max(60),
  reservedAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(90),
  tableId: z.string().cuid().nullable().optional(),
  customerId: z.string().cuid().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  internalNote: z.string().max(1000).nullable().optional(),
  status: z.enum(['PENDING', 'CONFIRMED']).default('CONFIRMED'),
});
