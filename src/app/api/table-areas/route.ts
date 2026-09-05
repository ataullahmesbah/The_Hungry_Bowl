import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { tableAreaInputSchema } from '@/lib/validation/service';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.TABLE_VIEW }, async () =>
  apiSuccess(
    await prisma.tableArea.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { tables: { where: { deletedAt: null } } } } },
    }),
  ),
);

export const POST = route(
  { permission: PERMISSIONS.TABLE_MANAGE, bodySchema: tableAreaInputSchema },
  async ({ body, session }) => {
    const area = await prisma.tableArea.create({ data: body });
    await audit({ session, action: 'table_area.created', entity: 'TableArea', entityId: area.id, after: body });
    return apiSuccess(area, { status: 201 });
  },
);
