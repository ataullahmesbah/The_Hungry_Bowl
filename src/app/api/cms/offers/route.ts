import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { offerInputSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.WEBSITE_VIEW }, async () => {
  const offers = await prisma.offer.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return apiSuccess(offers);
});

export const POST = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: offerInputSchema },
  async ({ body, session }) => {
    const offer = await prisma.offer.create({
      data: {
        ...body,
        value: body.value != null ? new Prisma.Decimal(body.value) : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      },
    });
    await audit({ session, action: 'cms.offer_created', entity: 'Offer', entityId: offer.id, after: { title: offer.title } });
    return apiSuccess(offer, { status: 201 });
  },
);
