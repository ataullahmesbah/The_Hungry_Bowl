import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { verifyPassword } from '@/lib/security/password';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { createSession } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

const bodySchema = z.object({
  email: z.string().email('Enter a valid email address').max(200),
  password: z.string().min(1, 'Password is required').max(200),
});

const LOCK_THRESHOLD = 8;
const LOCK_MINUTES = 15;

/**
 * Failure responses are deliberately identical whether the email exists or
 * not, so this endpoint cannot be used to enumerate staff accounts.
 */
const INVALID = { code: 'invalid_credentials', message: 'Email or password is incorrect' };

export const POST = route(
  {
    public: true,
    bodySchema,
    rateLimit: { bucket: 'login', ...RATE_LIMITS.login },
  },
  async ({ body, req }) => {
    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        failedLoginCount: true,
        lockedUntil: true,
        mustChangePassword: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });

    if (!user || user.deletedAt) {
      // Spend roughly the same time as a real bcrypt compare.
      await verifyPassword(body.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidooo');
      return NextResponse.json({ ok: false, error: INVALID }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { ok: false, error: { code: 'account_locked', message: `Too many failed attempts. Try again in ${minutes} minute(s).` } },
        { status: 423, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const valid = await verifyPassword(body.password, user.passwordHash);

    if (!valid) {
      const attempts = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: attempts,
          lockedUntil: attempts >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await audit({
        action: 'auth.login_failed',
        entity: 'User',
        entityId: user.id,
        severity: 'MEDIUM',
        after: { email: user.email, attempts },
      });
      return NextResponse.json({ ok: false, error: INVALID }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, error: { code: 'account_disabled', message: 'This account is not active. Contact an administrator.' } },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (user.roles.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'no_role', message: 'No role is assigned to this account. Contact an administrator.' } },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await createSession(user.id, {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    await audit({
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      severity: 'LOW',
      after: { email: user.email },
    });

    return apiSuccess({
      user: { id: user.id, name: user.name, email: user.email },
      mustChangePassword: user.mustChangePassword,
    });
  },
);
