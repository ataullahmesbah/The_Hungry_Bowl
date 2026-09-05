import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { tableInputSchema } from '@/lib/validation/service';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.TABLE_MANAGE, bodySchema: tableInputSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.restaurantTable.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Table not found', 'not_found');

    const table = await prisma.restaurantTable.update({ where: { id: params.id }, data: body });
    await audit({ session, action: 'table.updated', entity: 'RestaurantTable', entityId: table.id, before, after: table });
    return apiSuccess(table);
  },
);

export const DELETE = route({ permission: PERMISSIONS.TABLE_MANAGE }, async ({ params, session }) => {
  const table = await prisma.restaurantTable.findUnique({
    where: { id: params.id },
    include: { sessions: { where: { status: 'OPEN' }, select: { id: true } } },
  });
  if (!table || table.deletedAt) throw new HttpError(404, 'Table not found', 'not_found');

  if (table.sessions.length > 0) {
    throw new HttpError(409, 'Guests are still seated at this table. Close the session first.', 'session_open');
  }

  // Soft delete keeps historical orders pointing at a real table name.
  await prisma.restaurantTable.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false, status: 'MAINTENANCE' },
  });
  await audit({ session, action: 'table.removed', entity: 'RestaurantTable', entityId: params.id, severity: 'MEDIUM', before: { name: table.name } });
  return apiSuccess({ removed: true });
});
