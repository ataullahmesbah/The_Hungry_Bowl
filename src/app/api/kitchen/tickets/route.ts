import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';

const querySchema = z.object({
  status: z.string().max(80).optional(),
  station: z.string().max(60).optional(),
});

/**
 * The kitchen queue.
 *
 * Ordered oldest first so the ticket that has been waiting longest is always
 * at the front — PRD §9 asks for age-based priority rather than a newest-first
 * feed a busy kitchen would have to scan.
 */
export const GET = route(
  { permission: PERMISSIONS.KITCHEN_VIEW, querySchema },
  async ({ query }) => {
    const statuses = query.status
      ? query.status.split(',').filter(Boolean)
      : ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];

    const tickets = await prisma.kitchenTicket.findMany({
      where: {
        status: { in: statuses as never },
        ...(query.station ? { station: query.station } : {}),
      },
      orderBy: [{ priority: 'desc' }, { receivedAt: 'asc' }],
      take: 60,
      include: {
        items: { orderBy: { id: 'asc' } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            secretCode: true,
            type: true,
            note: true,
            guestCount: true,
            table: { select: { name: true } },
            session: { select: { code: true } },
          },
        },
      },
    });

    return apiSuccess(tickets);
  },
);
