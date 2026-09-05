import type { PriceDisplayMode } from '@prisma/client';
import { formatMoney, formatPriceRange, type CurrencyConfig } from '@/lib/format';

export interface VariantLike {
  price: unknown;
  isAvailable: boolean;
}

/**
 * Turns an item's pricing configuration into the exact string a customer sees.
 *
 * PRD §5 is explicit that a priceless item must never render as "৳0" or a
 * placeholder that could mislead. Returning null here means the caller renders
 * nothing at all rather than a zero.
 */
export function publicPriceLabel(
  item: { priceDisplayMode: PriceDisplayMode; basePrice: unknown },
  variants: VariantLike[],
  currency: CurrencyConfig,
): string | null {
  if (item.priceDisplayMode === 'HIDDEN') return null;

  const prices = variants
    .filter((v) => v.isAvailable)
    .map((v) => Number(v.price))
    .filter((p) => Number.isFinite(p) && p > 0);

  if (item.priceDisplayMode === 'RANGE') {
    if (prices.length === 0) return null;
    return formatPriceRange(Math.min(...prices), Math.max(...prices), currency);
  }

  // FIXED
  const base = Number(item.basePrice ?? 0);
  if (base > 0) return formatMoney(base, currency);
  if (prices.length > 0) return formatMoney(Math.min(...prices), currency);
  return null;
}

export const SPICE_LABELS = ['Not spicy', 'Mild', 'Medium', 'Hot', 'Very hot'] as const;

export function spiceLabel(level: number): string {
  return SPICE_LABELS[Math.max(0, Math.min(4, level))] ?? 'Mild';
}
