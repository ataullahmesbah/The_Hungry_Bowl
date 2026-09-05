import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { seoEntrySchema } from '@/lib/validation/settings';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.SEO_MANAGE, bodySchema: seoEntrySchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.seoEntry.findUnique({ where: { id: params.id } });
    if (!before) throw new HttpError(404, 'SEO entry not found', 'not_found');

    const entry = await prisma.seoEntry.update({
      where: { id: params.id },
      data: { ...body, updatedBy: session!.user.id },
    });
    await audit({ session, action: 'seo.entry_updated', entity: 'SeoEntry', entityId: entry.id, before: { path: before.path }, after: { path: entry.path } });
    return apiSuccess(entry);
  },
);

export const DELETE = route({ permission: PERMISSIONS.SEO_MANAGE }, async ({ params, session }) => {
  const entry = await prisma.seoEntry.findUnique({ where: { id: params.id } });
  if (!entry) throw new HttpError(404, 'SEO entry not found', 'not_found');

  await prisma.seoEntry.delete({ where: { id: params.id } });
  await audit({ session, action: 'seo.entry_deleted', entity: 'SeoEntry', entityId: params.id, before: { path: entry.path } });
  return apiSuccess({ deleted: true });
});
