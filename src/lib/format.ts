import type { PublicSettings } from '@/lib/settings';

export type CurrencyConfig = Pick<
  PublicSettings,
  'currencySymbol' | 'currencyPosition' | 'currencyDecimals' | 'locale' | 'currencyCode'
>;

export const FALLBACK_CURRENCY: CurrencyConfig = {
  currencySymbol: '৳',
  currencyPosition: 'before',
  currencyDecimals: 2,
  locale: 'en-BD',
  currencyCode: 'BDT',
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  // Prisma Decimal
  const maybe = value as { toString?: () => string };
  return typeof maybe.toString === 'function' ? Number(maybe.toString()) || 0 : 0;
}

export function formatMoney(value: unknown, config: CurrencyConfig = FALLBACK_CURRENCY): string {
  const amount = toNumber(value);
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(config.locale || 'en-US', {
      minimumFractionDigits: config.currencyDecimals,
      maximumFractionDigits: config.currencyDecimals,
    }).format(amount);
  } catch {
    formatted = amount.toFixed(config.currencyDecimals);
  }
  return config.currencyPosition === 'after'
    ? `${formatted}${' '}${config.currencySymbol}`
    : `${config.currencySymbol}${formatted}`;
}

/** Price shown on the public site, honouring the item's display mode. */
export function formatPriceRange(
  min: unknown,
  max: unknown,
  config: CurrencyConfig = FALLBACK_CURRENCY,
): string {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (lo === hi) return formatMoney(lo, config);
  return `${formatMoney(lo, config)} – ${formatMoney(hi, config)}`;
}

export function formatNumber(value: unknown, locale = 'en-US', decimals = 0): string {
  const amount = toNumber(value);
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return amount.toFixed(decimals);
  }
}

export function formatQuantity(value: unknown, unit?: string | null): string {
  const amount = toNumber(value);
  const trimmed = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(3)));
  return unit ? `${trimmed} ${unit}` : trimmed;
}

export function formatDateTime(
  value: Date | string | null | undefined,
  timezone = 'Asia/Dhaka',
  locale = 'en-GB',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function formatDate(
  value: Date | string | null | undefined,
  timezone = 'Asia/Dhaka',
  locale = 'en-GB',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatTime(
  value: Date | string | null | undefined,
  timezone = 'Asia/Dhaka',
  locale = 'en-GB',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: timezone }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** "12m 30s" style elapsed label used on the kitchen display. */
export function elapsedLabel(from: Date | string, now: Date = new Date()): string {
  const start = typeof from === 'string' ? new Date(from) : from;
  const seconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Only ever keep the last four characters of a payment reference. */
export function maskReference(value: string | null | undefined, keep = 4): string {
  if (!value) return '—';
  const clean = value.trim();
  if (clean.length <= keep) return clean;
  return `••••${clean.slice(-keep)}`;
}
