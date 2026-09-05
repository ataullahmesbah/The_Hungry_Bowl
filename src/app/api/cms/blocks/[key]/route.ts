import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { contentBlockSchema } from '@/lib/validation/cms';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

/**
 * Home page sections. The payload shape is intentionally free-form JSON so an
 * owner can retitle the hero or swap the highlight cards without a deploy;
 * each renderer treats missing fields as "hide this bit".
 */
export const PATCH = route(
  { permission: PERMISSIONS.WEBSITE_MANAGE, bodySchema: contentBlockSchema },
  async ({ body, params, session }) => {
    const before = await prisma.contentBlock.findUnique({ where: { key: params.key } });
    if (!before) throw new HttpError(404, 'Section not found', 'not_found');

    const block = await prisma.contentBlock.update({
      where: { key: params.key },
      data: {
        data: JSON.parse(JSON.stringify(body.data)),
        ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
        updatedBy: session!.user.id,
      },
    });

    await audit({
      session,
      action: 'cms.block_updated',
      entity: 'ContentBlock',
      entityId: block.key,
      before: before.data,
      after: block.data,
    });

    return apiSuccess(block);
  },
);
