import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * bcryptjs (pure JS) rather than a native binding, so the same build runs on
 * Vercel's serverless runtime, a Docker image and a bare VPS with no rebuild.
 */
const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[a-z]/.test(v), 'Password must contain a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Password must contain an uppercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain a number');

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'admin123', 'letmein123', 'welcome123', 'restaurant',
]);

export function isCommonPassword(plain: string): boolean {
  return COMMON.has(plain.toLowerCase());
}
