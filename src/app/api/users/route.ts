import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { userCreateSchema } from '@/lib/validation/settings';
import { hashPassword, isCommonPassword } from '@/lib/security/password';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({ search: z.string().max(120).optional() });

export const GET = route(
  { permission: PERMISSIONS.USER_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        ...paginate(query),
        // Never select passwordHash — it must not exist in any response shape.
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          avatarUrl: true,
          lastLoginAt: true,
          mustChangePassword: true,
          lockedUntil: true,
          createdAt: true,
          roles: { select: { role: { select: { id: true, key: true, name: true, rank: true } } } },
          _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return apiSuccess({ items: users, meta: pageMeta(total, query) });
  },
);

/**
 * Create a staff account.
 *
 * A user can never be given a role more powerful than their own — the rank
 * check stops a manager quietly promoting themselves by creating a
 * super-admin and logging in as it.
 */
export const POST = route(
  { permission: PERMISSIONS.USER_MANAGE, bodySchema: userCreateSchema },
  async ({ body, session }) => {
    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
    if (existing) {
      throw new HttpError(409, 'An account with that email already exists.', 'duplicate', {
        email: 'Already in use',
      });
    }
    if (isCommonPassword(body.password)) {
      throw new HttpError(422, 'That password is too common. Choose a different one.', 'weak_password', {
        password: 'Too common',
      });
    }

    const roles = await prisma.role.findMany({ where: { id: { in: body.roleIds } }, select: { id: true, key: true, rank: true, name: true } });
    if (roles.length !== body.roleIds.length) throw new HttpError(422, 'One of those roles does not exist.', 'invalid_role');

    const highest = Math.min(...roles.map((r) => r.rank));
    if (highest < session!.user.rank) {
      throw new HttpError(
        403,
        'You cannot give someone a role more senior than your own.',
        'role_too_senior',
        { roleIds: 'Choose a role at or below your level' },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        passwordHash: await hashPassword(body.password),
        mustChangePassword: body.mustChangePassword,
        roles: { create: body.roleIds.map((roleId) => ({ roleId, assignedBy: session!.user.id })) },
      },
      select: { id: true, name: true, email: true, status: true },
    });

    await audit({
      session,
      action: 'user.created',
      entity: 'User',
      entityId: user.id,
      severity: 'HIGH',
      after: { email: user.email, name: user.name, roles: roles.map((r) => r.key) },
    });

    return apiSuccess(user, { status: 201 });
  },
);
