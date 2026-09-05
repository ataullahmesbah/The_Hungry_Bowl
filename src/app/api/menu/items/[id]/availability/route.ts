import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { availabilityInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { publishEvent } from '@/lib/realtime/publish';
import { HttpError } from '@/lib/auth/guard';

/**
 * The availability switch from PRD §6.
 *
 * Turning an item OFF never deletes it: the record stays, the website shows
 * "Unavailable", and the internal order screen stops offering it. A realtime
 * event is published so an order screen already open on a waiter's tablet
 * updates without a refresh.
 */
export const PATCH = route(
  { permission: PERMISSIONS.MENU_TOGGLE_AVAILABILITY, bodySchema: availabilityInputSchema },
  async ({ body, params, session }) => {
    const item = await prisma.menuItem.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, isAvailable: true, deletedAt: true },
    });
    if (!item || item.deletedAt) throw new HttpError(404, 'Menu item not found', 'not_found');

    if (body.variantId) {
      const variant = await prisma.menuVariant.findUnique({ where: { id: body.variantId } });
      if (!variant || variant.menuItemId !== params.id) {
        throw new HttpError(404, 'Size not found on this item', 'not_found');
      }
      await prisma.menuVariant.update({
        where: { id: body.variantId },
        data: { isAvailable: body.isAvailable },
      });
    } else {
      await prisma.menuItem.update({
        where: { id: params.id },
        data: {
          isAvailable: body.isAvailable,
          unavailableReason: body.isAvailable ? null : (body.reason ?? null),
          unavailableSince: body.isAvailable ? null : new Date(),
        },
      });
    }

    await prisma.menuAvailabilityLog.create({
      data: {
        menuItemId: params.id,
        variantId: body.variantId ?? null,
        isAvailable: body.isAvailable,
        reason: body.reason ?? null,
        changedById: session!.user.id,
      },
    });

    await publishEvent({
      channel: 'menu',
      type: body.isAvailable ? 'menu.item_available' : 'menu.item_unavailable',
      payload: { menuItemId: params.id, variantId: body.variantId ?? null, name: item.name },
      requiredPermission: PERMISSIONS.MENU_VIEW,
    });

    await notify({
      type: 'menu.availability_changed',
      title: `${item.name} is now ${body.isAvailable ? 'available' : 'unavailable'}`,
      body: body.reason ?? undefined,
      level: body.isAvailable ? 'SUCCESS' : 'WARNING',
      href: `/dashboard/menu/${params.id}`,
      permissions: [PERMISSIONS.ORDER_CREATE, PERMISSIONS.KITCHEN_VIEW],
      excludeUserId: session!.user.id,
    });

    await audit({
      session,
      action: 'menu.availability_changed',
      entity: 'MenuItem',
      entityId: params.id,
      before: { isAvailable: item.isAvailable },
      after: { isAvailable: body.isAvailable, reason: body.reason },
    });

    return apiSuccess({ isAvailable: body.isAvailable });
  },
);
