import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { userUpdateSchema } from '@/lib/validation/settings';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

async function assertCanManage(targetId: string, actorRank: number, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { roles: { select: { role: { select: { key: true, rank: true, name: true } } } } },
  });
  if (!target || target.deletedAt) throw new HttpError(404, 'User not found', 'not_found');

  const targetRank = Math.min(999, ...target.roles.map((r) => r.role.rank));
  // Managing someone more senior than you is refused, but editing yourself is
  // always allowed so an owner is never locked out of their own account.
  if (targetRank < actorRank && target.id !== actorId) {
    throw new HttpError(403, 'You cannot manage an account more senior than your own.', 'forbidden');
  }
  return target;
}

export const GET = route({ permission: PERMISSIONS.USER_VIEW }, async ({ params }) => {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      lastLoginAt: true,
      mustChangePassword: true,
      lockedUntil: true,
      createdAt: true,
      roles: { select: { role: { select: { id: true, key: true, name: true, rank: true } } } },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userAgent: true, lastSeenAt: true, createdAt: true },
        orderBy: { lastSeenAt: 'desc' },
      },
    },
  });
  if (!user) throw new HttpError(404, 'User not found', 'not_found');
  return apiSuccess(user);
});

export const PATCH = route(
  { permission: PERMISSIONS.USER_MANAGE, bodySchema: userUpdateSchema },
  async ({ body, params, session }) => {
    const target = await assertCanManage(params.id, session!.user.rank, session!.user.id);

    if (body.roleIds) {
      const roles = await prisma.role.findMany({ where: { id: { in: body.roleIds } }, select: { id: true, rank: true, key: true } });
      if (roles.length !== body.roleIds.length) throw new HttpError(422, 'One of those roles does not exist.', 'invalid_role');
      if (Math.min(...roles.map((r) => r.rank)) < session!.user.rank) {
        throw new HttpError(403, 'You cannot grant a role more senior than your own.', 'role_too_senior');
      }
    }

    // Suspending an account has to sign it out, or the person keeps working
    // from an already-open tab.
    const suspending = body.status && body.status !== 'ACTIVE' && target.status === 'ACTIVE';

    const user = await prisma.$transaction(async (tx) => {
      if (body.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: params.id } });
        await tx.userRole.createMany({
          data: body.roleIds.map((roleId) => ({ userId: params.id, roleId, assignedBy: session!.user.id })),
        });
      }
      return tx.user.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
        select: { id: true, name: true, email: true, status: true },
      });
    });

    if (suspending) await revokeAllSessionsForUser(params.id);

    await audit({
      session,
      action: 'user.updated',
      entity: 'User',
      entityId: user.id,
      severity: 'HIGH',
      before: { status: target.status, roles: target.roles.map((r) => r.role.key) },
      after: { status: user.status, roles: body.roleIds ?? undefined },
    });

    return apiSuccess(user);
  },
);

export const DELETE = route({ permission: PERMISSIONS.USER_MANAGE }, async ({ params, session }) => {
  if (params.id === session!.user.id) {
    throw new HttpError(409, 'You cannot remove your own account.', 'self_delete');
  }
  const target = await assertCanManage(params.id, session!.user.rank, session!.user.id);

  await prisma.user.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'DISABLED' },
  });
  await revokeAllSessionsForUser(params.id);

  await audit({
    session,
    action: 'user.removed',
    entity: 'User',
    entityId: params.id,
    severity: 'HIGH',
    before: { email: target.email, name: target.name },
  });

  return apiSuccess({ removed: true });
});
