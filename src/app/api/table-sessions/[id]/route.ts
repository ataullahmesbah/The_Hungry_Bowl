import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { summariseSession } from '@/lib/service/sessions';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.TABLE_VIEW }, async ({ params }) => {
  const session = await prisma.tableSession.findUnique({
    where: { id: params.id },
    include: {
      table: { select: { id: true, name: true, capacity: true } },
      customer: { select: { id: true, name: true, phone: true, email: true } },
      reservation: { select: { id: true, code: true, reservedAt: true } },
      orders: {
        orderBy: { createdAt: 'asc' },
        include: {
          items: { include: { options: true } },
          payments: { include: { method: { select: { name: true, key: true } } } },
        },
      },
    },
  });

  if (!session) throw new HttpError(404, 'Session not found', 'not_found');

  return apiSuccess({ ...session, totals: summariseSession(session.orders) });
});
