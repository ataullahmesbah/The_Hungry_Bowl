import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { pageInputSchema, RESERVED_SLUGS } from '@/lib/validation/cms';
import { sanitizeHtml } from '@/lib/security/sanitize';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.WEBSITE_VIEW }, async () => {
  const pages = await prisma.page.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, slug: true, kind: true, status: true, updatedAt: true, noIndex: true },
  });
  return apiSuccess(pages);
});

export const POST = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: pageInputSchema },
  async ({ body, session }) => {
    if (RESERVED_SLUGS.has(body.slug)) {
      throw new HttpError(422, `“${body.slug}” is reserved by the website. Choose a different address.`, 'reserved_slug');
    }

    const page = await prisma.page.create({
      data: {
        ...body,
        // Sanitised on write as well as on render, so a rule tightened later
        // still protects rows written today.
        content: sanitizeHtml(body.content),
        authorId: session!.user.id,
        publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
      },
    });

    await audit({ session, action: 'cms.page_created', entity: 'Page', entityId: page.id, after: { title: page.title, slug: page.slug } });
    return apiSuccess(page, { status: 201 });
  },
);
