import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { openSessionSchema } from '@/lib/validation/service';
import { assertTableAvailable, summariseSession, uniqueSessionCode } from '@/lib/service/sessions';
import { publishEvent } from '@/lib/realtime/publish';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).optional(),
  tableId: z.string().cuid().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.TABLE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tableId ? { tableId: query.tableId } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.tableSession.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        ...paginate(query),
        include: {
          table: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } },
          orders: {
            where: { status: { not: 'CANCELLED' } },
            select: {
              id: true,
              orderNumber: true,
              secretCode: true,
              status: true,
              paymentState: true,
              totalAmount: true,
              paidAmount: true,
              dueAmount: true,
            },
          },
        },
      }),
      prisma.tableSession.count({ where }),
    ]);

    return apiSuccess({
      items: sessions.map((s) => ({ ...s, totals: summariseSession(s.orders) })),
      meta: pageMeta(total, query),
    });
  },
);

/**
 * Seat a party.
 *
 * This is the record that makes "one table, many parties" correct: every order
 * the party places attaches to THIS session and settles into its bill. When
 * they leave the session closes, and the next party gets a brand new session
 * with a brand new bill. Two parties can never share a total.
 */
export const POST = route(
  { permission: PERMISSIONS.TABLE_SESSION_MANAGE, bodySchema: openSessionSchema },
  async ({ body, session }) => {
    const table = await assertTableAvailable(body.tableId);

    if (body.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: body.customerId },
        select: { id: true, isBlacklisted: true, name: true },
      });
      if (!customer || customer.isBlacklisted) {
        throw new HttpError(409, 'That customer record cannot be seated.', 'customer_unavailable');
      }
    }

    if (body.reservationId) {
      const reservation = await prisma.reservation.findUnique({
        where: { id: body.reservationId },
        select: { id: true, status: true, session: { select: { id: true } } },
      });
      if (!reservation) throw new HttpError(404, 'Reservation not found', 'not_found');
      if (reservation.session) {
        throw new HttpError(409, 'That reservation has already been seated.', 'reservation_seated');
      }
    }

    const code = await uniqueSessionCode();

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.tableSession.create({
        data: {
          code,
          tableId: body.tableId,
          customerId: body.customerId ?? null,
          guestName: body.guestName?.trim() || null,
          guestPhone: body.guestPhone?.trim() || null,
          guestCount: body.guestCount,
          reservationId: body.reservationId ?? null,
          notes: body.notes?.trim() || null,
          openedById: session!.user.id,
        },
        include: { table: { select: { id: true, name: true } } },
      });

      await tx.restaurantTable.update({ where: { id: body.tableId }, data: { status: 'OCCUPIED' } });

      if (body.reservationId) {
        await tx.reservation.update({
          where: { id: body.reservationId },
          data: { status: 'COMPLETED', tableId: body.tableId },
        });
      }

      if (body.customerId) {
        await tx.customer.update({
          where: { id: body.customerId },
          data: { totalVisits: { increment: 1 }, lastVisitAt: new Date() },
        });
      }

      return row;
    });

    await publishEvent({
      channel: 'tables',
      type: 'session.opened',
      payload: { sessionId: created.id, code: created.code, tableId: table.id, tableName: table.name },
      requiredPermission: PERMISSIONS.TABLE_VIEW,
    });

    await audit({
      session,
      action: 'session.opened',
      entity: 'TableSession',
      entityId: created.id,
      after: { code: created.code, table: table.name, guests: created.guestCount },
    });

    return apiSuccess(created, { status: 201 });
  },
);
