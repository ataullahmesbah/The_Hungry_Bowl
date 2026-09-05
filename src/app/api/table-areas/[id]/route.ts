import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { tableAreaInputSchema } from '@/lib/validation/service';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.TABLE_MANAGE, bodySchema: tableAreaInputSchema.partial() },
  async ({ body, params, session }) => {
    const area = await prisma.tableArea.update({ where: { id: params.id }, data: body });
    await audit({ session, action: 'table_area.updated', entity: 'TableArea', entityId: area.id, after: body });
    return apiSuccess(area);
  },
);

export const DELETE = route({ permission: PERMISSIONS.TABLE_MANAGE }, async ({ params, session }) => {
  const area = await prisma.tableArea.findUnique({
    where: { id: params.id },
    include: { _count: { select: { tables: { where: { deletedAt: null } } } } },
  });
  if (!area) throw new HttpError(404, 'Area not found', 'not_found');
  if (area._count.tables > 0) {
    throw new HttpError(409, `Move the ${area._count.tables} table(s) in this area first.`, 'area_not_empty');
  }

  await prisma.tableArea.delete({ where: { id: params.id } });
  await audit({ session, action: 'table_area.deleted', entity: 'TableArea', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ deleted: true });
});
