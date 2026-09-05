import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { staffReservationSchema } from '@/lib/validation/service';
import { uniqueReservationCode } from '@/lib/service/sessions';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(120).optional(),
});

export const GET = route(
  { permission: PERMISSIONS.RESERVATION_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.ReservationWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            reservedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { code: { contains: query.search.toUpperCase() } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        orderBy: { reservedAt: 'asc' },
        ...paginate(query),
        include: {
          table: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          session: { select: { id: true, code: true } },
        },
      }),
      prisma.reservation.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

/** A reservation taken over the phone by reception. */
export const POST = route(
  { permission: PERMISSIONS.RESERVATION_MANAGE, bodySchema: staffReservationSchema },
  async ({ body, session }) => {
    const code = await uniqueReservationCode();

    const reservation = await prisma.reservation.create({
      data: {
        code,
        name: body.name.trim(),
        phone: body.phone.trim(),
        email: body.email?.trim() || null,
        guestCount: body.guestCount,
        reservedAt: new Date(body.reservedAt),
        durationMinutes: body.durationMinutes,
        tableId: body.tableId ?? null,
        customerId: body.customerId ?? null,
        note: body.note?.trim() || null,
        internalNote: body.internalNote?.trim() || null,
        status: body.status,
        source: 'staff',
        confirmedById: body.status === 'CONFIRMED' ? session!.user.id : null,
        confirmedAt: body.status === 'CONFIRMED' ? new Date() : null,
      },
    });

    await audit({
      session,
      action: 'reservation.created',
      entity: 'Reservation',
      entityId: reservation.id,
      after: { code: reservation.code, name: reservation.name, status: reservation.status },
    });

    return apiSuccess(reservation, { status: 201 });
  },
);
