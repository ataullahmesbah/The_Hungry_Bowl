import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { reviewModerationSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.REVIEWS_MODERATE, bodySchema: reviewModerationSchema },
  async ({ body, params, session }) => {
    const before = await prisma.review.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Review not found', 'not_found');

    const review = await prisma.review.update({
      where: { id: params.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
        ...(body.reply !== undefined
          ? { reply: body.reply, repliedAt: body.reply ? new Date() : null }
          : {}),
      },
    });

    await audit({
      session,
      action: 'cms.review_moderated',
      entity: 'Review',
      entityId: review.id,
      before: { status: before.status, isFeatured: before.isFeatured },
      after: { status: review.status, isFeatured: review.isFeatured },
    });

    return apiSuccess(review);
  },
);

export const DELETE = route({ permission: PERMISSIONS.REVIEWS_MODERATE }, async ({ params, session }) => {
  const review = await prisma.review.findUnique({ where: { id: params.id } });
  if (!review || review.deletedAt) throw new HttpError(404, 'Review not found', 'not_found');

  await prisma.review.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: 'REJECTED' } });
  await audit({ session, action: 'cms.review_deleted', entity: 'Review', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ deleted: true });
});
