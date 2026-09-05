import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { reservationStatusSchema } from '@/lib/validation/service';
import { publishEvent } from '@/lib/realtime/publish';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Confirm, reject, cancel or mark a reservation.
 *
 * Assigning a table here only reserves it on paper — the table's live status
 * belongs to the session lifecycle, so a booking for tonight never blocks a
 * walk-in from being seated right now.
 */
export const PATCH = route(
  { permission: PERMISSIONS.RESERVATION_MANAGE, bodySchema: reservationStatusSchema },
  async ({ body, params, session }) => {
    const before = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { table: { select: { name: true } } },
    });
    if (!before || before.deletedAt) throw new HttpError(404, 'Reservation not found', 'not_found');

    if (body.tableId) {
      const table = await prisma.restaurantTable.findUnique({
        where: { id: body.tableId },
        select: { id: true, capacity: true, name: true, isActive: true, deletedAt: true },
      });
      if (!table || table.deletedAt || !table.isActive) {
        throw new HttpError(404, 'Table not found or not in service', 'not_found');
      }
      if (table.capacity < before.guestCount) {
        throw new HttpError(
          409,
          `Table ${table.name} seats ${table.capacity}, but this booking is for ${before.guestCount}.`,
          'table_too_small',
        );
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id: params.id },
      data: {
        status: body.status,
        ...(body.tableId !== undefined ? { tableId: body.tableId } : {}),
        ...(body.internalNote !== undefined ? { internalNote: body.internalNote } : {}),
        ...(body.cancelReason !== undefined ? { cancelReason: body.cancelReason } : {}),
        ...(body.status === 'CONFIRMED'
          ? { confirmedById: session!.user.id, confirmedAt: new Date() }
          : {}),
      },
      include: { table: { select: { name: true } } },
    });

    await publishEvent({
      channel: 'reservations',
      type: 'reservation.updated',
      payload: { reservationId: reservation.id, code: reservation.code, status: reservation.status },
      requiredPermission: PERMISSIONS.RESERVATION_VIEW,
    });

    await audit({
      session,
      action: 'reservation.status_changed',
      entity: 'Reservation',
      entityId: reservation.id,
      before: { status: before.status, table: before.table?.name },
      after: { status: reservation.status, table: reservation.table?.name },
    });

    return apiSuccess(reservation);
  },
);

export const DELETE = route({ permission: PERMISSIONS.RESERVATION_MANAGE }, async ({ params, session }) => {
  const reservation = await prisma.reservation.findUnique({ where: { id: params.id } });
  if (!reservation || reservation.deletedAt) throw new HttpError(404, 'Reservation not found', 'not_found');

  await prisma.reservation.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  });
  await audit({ session, action: 'reservation.deleted', entity: 'Reservation', entityId: params.id, severity: 'MEDIUM', before: { code: reservation.code } });
  return apiSuccess({ deleted: true });
});
