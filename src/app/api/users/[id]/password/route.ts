import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { resetPasswordSchema } from '@/lib/validation/settings';
import { hashPassword, isCommonPassword } from '@/lib/security/password';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Manager-initiated password reset.
 *
 * The new password is never returned or logged, every existing session for
 * that account is revoked, and by default the user must set their own on next
 * sign-in — so a reset does not leave a manager knowing a working password.
 */
export const POST = route(
  { permission: PERMISSIONS.USER_MANAGE, bodySchema: resetPasswordSchema },
  async ({ body, params, session }) => {
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      include: { roles: { select: { role: { select: { rank: true } } } } },
    });
    if (!target || target.deletedAt) throw new HttpError(404, 'User not found', 'not_found');

    const targetRank = Math.min(999, ...target.roles.map((r) => r.role.rank));
    if (targetRank < session!.user.rank && target.id !== session!.user.id) {
      throw new HttpError(403, 'You cannot reset the password of a more senior account.', 'forbidden');
    }
    if (isCommonPassword(body.password)) {
      throw new HttpError(422, 'That password is too common. Choose a different one.', 'weak_password', {
        password: 'Too common',
      });
    }

    await prisma.user.update({
      where: { id: params.id },
      data: {
        passwordHash: await hashPassword(body.password),
        passwordChangedAt: new Date(),
        mustChangePassword: body.mustChangePassword,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await revokeAllSessionsForUser(params.id);

    await audit({
      session,
      action: 'user.password_reset',
      entity: 'User',
      entityId: params.id,
      severity: 'HIGH',
      after: { email: target.email, mustChangePassword: body.mustChangePassword },
    });

    return apiSuccess({ reset: true });
  },
);
