import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIdentifier } from './hash';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Database-backed fixed-window limiter.
 *
 * Serverless invocations do not share memory, so an in-process counter would
 * reset constantly and protect nothing. Postgres is the shared state we already
 * have; the row count stays tiny because expired buckets are swept on write.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT_ENABLED) {
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }

  const key = `${bucket}:${hashIdentifier(identifier, env.AUTH_SECRET).slice(0, 32)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  try {
    const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

    if (!existing || existing.expiresAt <= now) {
      await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: 1, expiresAt },
      });
      return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000)),
      };
    }

    const updated = await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { ok: true, remaining: Math.max(0, limit - updated.count), retryAfterSeconds: 0 };
  } catch {
    // Never let the limiter itself take the site down.
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/** Housekeeping — safe to call from any low-traffic route. */
export async function sweepRateLimits() {
  await prisma.rateLimitBucket
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
}

export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 300 },
  passwordChange: { limit: 5, windowSeconds: 900 },
  publicReservation: { limit: 5, windowSeconds: 3600 },
  publicReview: { limit: 3, windowSeconds: 3600 },
  publicContact: { limit: 5, windowSeconds: 3600 },
  mutation: { limit: 120, windowSeconds: 60 },
  read: { limit: 300, windowSeconds: 60 },
  upload: { limit: 40, windowSeconds: 300 },
} as const;
