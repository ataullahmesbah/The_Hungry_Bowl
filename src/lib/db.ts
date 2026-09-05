import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One Prisma client per process. Next.js hot-reload would otherwise open a new
 * pool on every edit and exhaust Postgres connections.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * The JSON-safe shape of a Prisma result: Decimal becomes number, Date and
 * BigInt become strings. Declaring it keeps client components honest about
 * what they actually receive across the server/client boundary.
 */
export type Serialized<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends bigint
      ? string
      : T extends (infer U)[]
        ? Serialized<U>[]
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;

/**
 * Convert Prisma Decimal / BigInt / Date values into JSON-safe primitives.
 *
 * This walks the value itself rather than going through JSON.stringify with a
 * replacer. That matters: JSON.stringify calls a value's own toJSON() BEFORE
 * handing it to the replacer, and Decimal.toJSON() returns a STRING — so a
 * replacer can never see a Decimal, and every money field would silently reach
 * the browser as "1250.50" instead of 1250.5, breaking arithmetic on a value
 * the types promise is a number.
 */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return Number(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = toJsonSafe((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function serialize<T>(value: T): Serialized<T> {
  return toJsonSafe(value) as Serialized<T>;
}
