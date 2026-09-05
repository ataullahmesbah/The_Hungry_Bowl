import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { offerInputSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: offerInputSchema },
  async ({ body, params, session }) => {
    const before = await prisma.offer.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Offer not found', 'not_found');

    const offer = await prisma.offer.update({
      where: { id: params.id },
      data: {
        ...body,
        value: body.value != null ? new Prisma.Decimal(body.value) : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    await audit({ session, action: 'cms.offer_updated', entity: 'Offer', entityId: offer.id, before: { title: before.title, status: before.status }, after: { title: offer.title, status: offer.status } });
    return apiSuccess(offer);
  },
);

export const DELETE = route({ permission: PERMISSIONS.WEBSITE_MANAGE }, async ({ params, session }) => {
  const offer = await prisma.offer.findUnique({ where: { id: params.id } });
  if (!offer || offer.deletedAt) throw new HttpError(404, 'Offer not found', 'not_found');

  await prisma.offer.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  await audit({ session, action: 'cms.offer_archived', entity: 'Offer', entityId: params.id, severity: 'MEDIUM', before: { title: offer.title } });
  return apiSuccess({ archived: true });
});
