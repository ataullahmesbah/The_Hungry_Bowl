import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIdentifier, randomToken, safeEqual, sha256 } from '@/lib/security/hash';
import type { PermissionKey } from '@/lib/rbac/permissions';

export { SESSION_COOKIE } from './session-shared';
import { SESSION_COOKIE } from './session-shared';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  roleKeys: string[];
  roleNames: string[];
  /** Lowest (most powerful) rank across the user's roles. */
  rank: number;
  permissions: Set<string>;
}

export interface AuthSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
}

/**
 * The cookie value is `<sessionId>.<secret>`. Only a SHA-256 of the secret is
 * stored, so a database leak alone cannot be replayed as a valid session, and
 * revoking a row logs the user out instantly (a self-contained JWT could not).
 */
function splitToken(raw: string): { sessionId: string; secret: string } | null {
  const idx = raw.indexOf('.');
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { sessionId: raw.slice(0, idx), secret: raw.slice(idx + 1) };
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const secret = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(secret),
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ipHash: meta.ip ? hashIdentifier(meta.ip, env.AUTH_SECRET) : null,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${session.id}.${secret}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  });

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    const parts = splitToken(raw);
    if (parts) {
      await prisma.session
        .updateMany({ where: { id: parts.sessionId, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
  }
  cookieStore.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/**
 * Resolve the current session. Memoised per request so a page that checks
 * permissions in several places still costs one query.
 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const parts = splitToken(raw);
  if (!parts) return null;

  const record = await prisma.session.findUnique({
    where: { id: parts.sessionId },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          status: true,
          deletedAt: true,
          mustChangePassword: true,
          roles: {
            select: {
              role: {
                select: {
                  key: true,
                  name: true,
                  rank: true,
                  permissions: { select: { permission: { select: { key: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!record) return null;
  if (!safeEqual(record.tokenHash, sha256(parts.secret))) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  if (record.user.deletedAt || record.user.status !== 'ACTIVE') return null;

  const permissions = new Set<string>();
  let rank = 999;
  for (const ur of record.user.roles) {
    rank = Math.min(rank, ur.role.rank);
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  }

  return {
    sessionId: record.id,
    expiresAt: record.expiresAt,
    user: {
      id: record.user.id,
      email: record.user.email,
      name: record.user.name,
      avatarUrl: record.user.avatarUrl,
      mustChangePassword: record.user.mustChangePassword,
      roleKeys: record.user.roles.map((r) => r.role.key),
      roleNames: record.user.roles.map((r) => r.role.name),
      rank,
      permissions,
    },
  };
});

export function sessionHas(session: AuthSession | null, permission: PermissionKey | PermissionKey[]): boolean {
  if (!session) return false;
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((p) => session.user.permissions.has(p));
}

/** Best-effort client IP behind Vercel's proxy or an nginx reverse proxy. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? null;
}

export async function touchSession(sessionId: string) {
  await prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}
