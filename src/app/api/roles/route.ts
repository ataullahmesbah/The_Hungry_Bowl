import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { ALL_PERMISSIONS, PERMISSIONS, permissionDescription, permissionModule } from '@/lib/rbac/permissions';
import { roleSchema } from '@/lib/validation/settings';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.USER_VIEW }, async () => {
  const roles = await prisma.role.findMany({
    orderBy: { rank: 'asc' },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });

  return apiSuccess({
    roles: roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      rank: role.rank,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissionKeys: role.permissions.map((p) => p.permission.key),
    })),
    // The catalogue the UI renders its checkboxes from.
    permissions: ALL_PERMISSIONS.map((key) => ({
      key,
      module: permissionModule(key),
      description: permissionDescription(key),
    })),
  });
});

export const POST = route(
  { permission: PERMISSIONS.ROLE_MANAGE, bodySchema: roleSchema },
  async ({ body, session }) => {
    if (body.rank < session!.user.rank) {
      throw new HttpError(403, 'You cannot create a role more senior than your own.', 'rank_too_high');
    }

    const permissions = await prisma.permission.findMany({
      where: { key: { in: body.permissionKeys } },
      select: { id: true },
    });

    const role = await prisma.role.create({
      data: {
        key: body.key,
        name: body.name,
        description: body.description ?? null,
        rank: body.rank,
        isSystem: false,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });

    await audit({
      session,
      action: 'role.created',
      entity: 'Role',
      entityId: role.id,
      severity: 'HIGH',
      after: { key: role.key, permissions: body.permissionKeys.length },
    });

    return apiSuccess(role, { status: 201 });
  },
);
