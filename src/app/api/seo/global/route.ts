import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { seoGlobalSchema } from '@/lib/validation/settings';
import { getSeoGlobal } from '@/lib/settings';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.SEO_VIEW }, async () => apiSuccess(await getSeoGlobal()));

export const PATCH = route(
  { permission: PERMISSIONS.SEO_MANAGE, bodySchema: seoGlobalSchema.partial() },
  async ({ body, session }) => {
    const before = await getSeoGlobal();

    const seo = await prisma.seoGlobal.update({
      where: { id: 'singleton' },
      data: {
        ...body,
        ...(body.gaMeasurementId !== undefined ? { gaMeasurementId: body.gaMeasurementId || null } : {}),
        updatedBy: session!.user.id,
      },
    });

    await audit({
      session,
      action: 'seo.global_updated',
      entity: 'SeoGlobal',
      entityId: 'singleton',
      severity: before.allowIndexing !== seo.allowIndexing ? 'HIGH' : 'MEDIUM',
      before: { allowIndexing: before.allowIndexing, siteName: before.siteName },
      after: { allowIndexing: seo.allowIndexing, siteName: seo.siteName },
    });

    return apiSuccess(seo);
  },
);
