import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS, ALL_PERMISSIONS, permissionDescription, permissionModule } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { UsersManager } from './users-manager';

export const metadata = { title: 'Users & roles' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requirePagePermission(PERMISSIONS.USER_VIEW, '/dashboard/users');
  const settings = await getSettings();

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        mustChangePassword: true,
        lockedUntil: true,
        roles: { select: { role: { select: { id: true, key: true, name: true, rank: true } } } },
      },
    }),
    prisma.role.findMany({
      orderBy: { rank: 'asc' },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Who can sign in, and exactly what each of them is allowed to do."
      />
      <UsersManager
        users={serialize(users).map((u) => ({
          ...u,
          roles: u.roles.map((r) => r.role),
        }))}
        roles={roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          rank: r.rank,
          isSystem: r.isSystem,
          userCount: r._count.users,
          permissionKeys: r.permissions.map((p) => p.permission.key),
        }))}
        permissions={ALL_PERMISSIONS.map((key) => ({
          key,
          module: permissionModule(key),
          description: permissionDescription(key),
        }))}
        actorRank={session.user.rank}
        actorId={session.user.id}
        timezone={settings.timezone}
        locale={settings.locale}
        can={{
          manageUsers: session.user.permissions.has(PERMISSIONS.USER_MANAGE),
          manageRoles: session.user.permissions.has(PERMISSIONS.ROLE_MANAGE),
        }}
      />
    </div>
  );
}
