import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { eventInputSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.WEBSITE_VIEW }, async () => {
  const events = await prisma.event.findMany({ where: { deletedAt: null }, orderBy: { startsAt: 'desc' } });
  return apiSuccess(events);
});

export const POST = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: eventInputSchema },
  async ({ body, session }) => {
    const event = await prisma.event.create({
      data: { ...body, startsAt: new Date(body.startsAt), endsAt: body.endsAt ? new Date(body.endsAt) : null },
    });
    await audit({ session, action: 'cms.event_created', entity: 'Event', entityId: event.id, after: { title: event.title } });
    return apiSuccess(event, { status: 201 });
  },
);
