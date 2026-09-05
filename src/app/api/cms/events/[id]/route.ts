import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { eventInputSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: eventInputSchema },
  async ({ body, params, session }) => {
    const before = await prisma.event.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Event not found', 'not_found');

    const event = await prisma.event.update({
      where: { id: params.id },
      data: { ...body, startsAt: new Date(body.startsAt), endsAt: body.endsAt ? new Date(body.endsAt) : null },
    });
    await audit({ session, action: 'cms.event_updated', entity: 'Event', entityId: event.id, after: { title: event.title } });
    return apiSuccess(event);
  },
);

export const DELETE = route({ permission: PERMISSIONS.WEBSITE_MANAGE }, async ({ params, session }) => {
  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event || event.deletedAt) throw new HttpError(404, 'Event not found', 'not_found');

  await prisma.event.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  await audit({ session, action: 'cms.event_archived', entity: 'Event', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ archived: true });
});
