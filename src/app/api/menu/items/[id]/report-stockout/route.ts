import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const bodySchema = z.object({
  reason: z.string().max(200).optional(),
});

/**
 * Kitchen staff cannot switch an item off themselves — they raise a flag and a
 * manager decides. This is the first half of the PRD §6 flow, and it keeps the
 * menu under one accountable owner.
 */
export const POST = route(
  { permission: PERMISSIONS.MENU_REPORT_STOCKOUT, bodySchema },
  async ({ body, params, session }) => {
    const item = await prisma.menuItem.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, deletedAt: true, isAvailable: true },
    });
    if (!item || item.deletedAt) throw new HttpError(404, 'Menu item not found', 'not_found');

    await prisma.menuAvailabilityLog.create({
      data: {
        menuItemId: item.id,
        isAvailable: item.isAvailable,
        reason: `Stock-out reported: ${body.reason ?? 'no reason given'}`,
        changedById: session!.user.id,
      },
    });

    await notify({
      type: 'menu.stockout_reported',
      title: `Kitchen reports “${item.name}” has run out`,
      body: `${session!.user.name} asked for this item to be switched off.${body.reason ? ` Reason: ${body.reason}` : ''}`,
      level: 'WARNING',
      href: `/dashboard/menu/${item.id}`,
      permissions: [PERMISSIONS.MENU_TOGGLE_AVAILABILITY],
      excludeUserId: session!.user.id,
    });

    await audit({
      session,
      action: 'menu.stockout_reported',
      entity: 'MenuItem',
      entityId: item.id,
      after: { reason: body.reason },
    });

    return apiSuccess({ reported: true });
  },
);
