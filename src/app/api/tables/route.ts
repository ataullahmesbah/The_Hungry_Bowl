import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { tableInputSchema } from '@/lib/validation/service';
import { summariseSession } from '@/lib/service/sessions';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.TABLE_VIEW }, async () => {
  const tables = await prisma.restaurantTable.findMany({
    where: { deletedAt: null },
    orderBy: [{ area: { sortOrder: 'asc' } }, { name: 'asc' }],
    include: {
      area: { select: { id: true, name: true, floor: true } },
      sessions: {
        where: { status: 'OPEN' },
        take: 1,
        include: {
          customer: { select: { id: true, name: true } },
          orders: {
            where: { status: { not: 'CANCELLED' } },
            select: { id: true, status: true, totalAmount: true, paidAmount: true, dueAmount: true },
          },
        },
      },
    },
  });

  return apiSuccess(
    tables.map((table) => {
      const session = table.sessions[0] ?? null;
      return {
        ...table,
        sessions: undefined,
        session: session
          ? {
              id: session.id,
              code: session.code,
              guestCount: session.guestCount,
              guestName: session.guestName,
              customer: session.customer,
              openedAt: session.openedAt,
              totals: summariseSession(session.orders),
            }
          : null,
      };
    }),
  );
});

export const POST = route(
  { permission: PERMISSIONS.TABLE_MANAGE, bodySchema: tableInputSchema },
  async ({ body, session }) => {
    const table = await prisma.restaurantTable.create({ data: body });
    await audit({ session, action: 'table.created', entity: 'RestaurantTable', entityId: table.id, after: { name: table.name } });
    return apiSuccess(table, { status: 201 });
  },
);
