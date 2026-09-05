import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { hashPassword, isCommonPassword, passwordSchema, verifyPassword } from '@/lib/security/password';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

const bodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'The new password must be different from the current one',
    path: ['newPassword'],
  });

export const POST = route(
  { bodySchema, rateLimit: { bucket: 'password-change', ...RATE_LIMITS.passwordChange } },
  async ({ body, session }) => {
    if (isCommonPassword(body.newPassword)) {
      return NextResponse.json(
        { ok: false, error: { code: 'weak_password', message: 'That password is too common. Choose a different one.' } },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: { code: 'not_found', message: 'Account not found' } }, { status: 404 });
    }

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return NextResponse.json(
        { ok: false, error: { code: 'invalid_credentials', message: 'Your current password is incorrect' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    // Any other device holding a session for this account is signed out.
    await revokeAllSessionsForUser(user.id, session!.sessionId);

    await audit({
      session,
      action: 'auth.password_changed',
      entity: 'User',
      entityId: user.id,
      severity: 'HIGH',
    });

    return apiSuccess({ changed: true });
  },
);
