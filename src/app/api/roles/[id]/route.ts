import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { roleSchema } from '@/lib/validation/settings';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.ROLE_MANAGE, bodySchema: roleSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.role.findUnique({
      where: { id: params.id },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!before) throw new HttpError(404, 'Role not found', 'not_found');

    if (before.rank < session!.user.rank) {
      throw new HttpError(403, 'You cannot change a role more senior than your own.', 'forbidden');
    }
    // Locking out of Super Admin would make the system unadministrable.
    if (before.key === 'SUPER_ADMIN' && body.permissionKeys) {
      throw new HttpError(409, 'Super Admin always holds every permission and cannot be narrowed.', 'system_role');
    }
    if (before.isSystem && body.key && body.key !== before.key) {
      throw new HttpError(409, 'A built-in role cannot be renamed at the code level.', 'system_role');
    }

    const role = await prisma.$transaction(async (tx) => {
      if (body.permissionKeys) {
        const permissions = await tx.permission.findMany({
          where: { key: { in: body.permissionKeys } },
          select: { id: true },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: params.id } });
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: params.id, permissionId: p.id })),
        });
      }
      return tx.role.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.rank !== undefined && !before.isSystem ? { rank: body.rank } : {}),
        },
      });
    });

    await audit({
      session,
      action: 'role.updated',
      entity: 'Role',
      entityId: role.id,
      severity: 'HIGH',
      before: { key: before.key, permissions: before.permissions.map((p) => p.permission.key) },
      after: { key: role.key, permissions: body.permissionKeys },
    });

    return apiSuccess(role);
  },
);

export const DELETE = route({ permission: PERMISSIONS.ROLE_MANAGE }, async ({ params, session }) => {
  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new HttpError(404, 'Role not found', 'not_found');
  if (role.isSystem) throw new HttpError(409, 'Built-in roles cannot be deleted.', 'system_role');
  if (role._count.users > 0) {
    throw new HttpError(409, `${role._count.users} user(s) still hold this role. Move them first.`, 'role_in_use');
  }

  await prisma.role.delete({ where: { id: params.id } });
  await audit({ session, action: 'role.deleted', entity: 'Role', entityId: params.id, severity: 'HIGH', before: { key: role.key } });
  return apiSuccess({ deleted: true });
});
