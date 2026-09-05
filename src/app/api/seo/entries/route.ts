import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { seoEntrySchema } from '@/lib/validation/settings';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.SEO_VIEW }, async () =>
  apiSuccess(await prisma.seoEntry.findMany({ orderBy: { path: 'asc' } })),
);

export const POST = route(
  { permission: PERMISSIONS.SEO_MANAGE, bodySchema: seoEntrySchema },
  async ({ body, session }) => {
    const entry = await prisma.seoEntry.upsert({
      where: { path: body.path },
      create: { ...body, updatedBy: session!.user.id },
      update: { ...body, updatedBy: session!.user.id },
    });
    await audit({ session, action: 'seo.entry_saved', entity: 'SeoEntry', entityId: entry.id, after: { path: entry.path, noIndex: entry.noIndex } });
    return apiSuccess(entry, { status: 201 });
  },
);
