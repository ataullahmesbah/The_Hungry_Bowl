import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { pageInputSchema, RESERVED_SLUGS } from '@/lib/validation/cms';
import { sanitizeHtml } from '@/lib/security/sanitize';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.WEBSITE_VIEW }, async ({ params }) => {
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page || page.deletedAt) throw new HttpError(404, 'Page not found', 'not_found');
  return apiSuccess(page);
});

export const PATCH = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: pageInputSchema },
  async ({ body, params, session }) => {
    const before = await prisma.page.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Page not found', 'not_found');

    if (RESERVED_SLUGS.has(body.slug)) {
      throw new HttpError(422, `“${body.slug}” is reserved by the website. Choose a different address.`, 'reserved_slug');
    }

    const page = await prisma.page.update({
      where: { id: params.id },
      data: {
        ...body,
        content: sanitizeHtml(body.content),
        publishedAt:
          body.status === 'PUBLISHED' ? (before.publishedAt ?? new Date()) : before.publishedAt,
      },
    });

    await audit({
      session,
      action: 'cms.page_updated',
      entity: 'Page',
      entityId: page.id,
      before: { title: before.title, slug: before.slug, status: before.status },
      after: { title: page.title, slug: page.slug, status: page.status },
    });
    return apiSuccess(page);
  },
);

export const DELETE = route({ permission: PERMISSIONS.WEBSITE_MANAGE }, async ({ params, session }) => {
  const page = await prisma.page.findUnique({ where: { id: params.id } });
  if (!page || page.deletedAt) throw new HttpError(404, 'Page not found', 'not_found');

  await prisma.page.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  await audit({ session, action: 'cms.page_archived', entity: 'Page', entityId: params.id, severity: 'MEDIUM', before: { slug: page.slug } });
  return apiSuccess({ archived: true });
});
