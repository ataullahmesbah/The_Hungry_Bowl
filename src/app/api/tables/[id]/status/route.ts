import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { tableStatusSchema } from '@/lib/validation/service';
import { publishEvent } from '@/lib/realtime/publish';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Manual status changes (cleaning, maintenance). Seating and clearing guests
 * go through the session endpoints instead, which keep status in step
 * automatically.
 */
export const PATCH = route(
  { permission: PERMISSIONS.TABLE_SESSION_MANAGE, bodySchema: tableStatusSchema },
  async ({ body, params, session }) => {
    const table = await prisma.restaurantTable.findUnique({
      where: { id: params.id },
      include: { sessions: { where: { status: 'OPEN' }, select: { id: true, code: true } } },
    });
    if (!table || table.deletedAt) throw new HttpError(404, 'Table not found', 'not_found');

    if (table.sessions.length > 0 && body.status !== 'OCCUPIED') {
      throw new HttpError(
        409,
        `Guests are seated at ${table.name} (session ${table.sessions[0]!.code}). Close the session before changing the status.`,
        'session_open',
      );
    }

    const updated = await prisma.restaurantTable.update({ where: { id: params.id }, data: { status: body.status } });

    await publishEvent({
      channel: 'tables',
      type: 'table.status_changed',
      payload: { tableId: updated.id, name: updated.name, status: updated.status },
      requiredPermission: PERMISSIONS.TABLE_VIEW,
    });

    await audit({ session, action: 'table.status_changed', entity: 'RestaurantTable', entityId: updated.id, before: { status: table.status }, after: { status: updated.status } });
    return apiSuccess(updated);
  },
);
