import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { menuItemInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.MENU_VIEW }, async ({ params }) => {
  const item = await prisma.menuItem.findUnique({
    where: { id: params.id },
    include: {
      category: true,
      variants: { orderBy: { sortOrder: 'asc' } },
      addOnGroups: { include: { group: { include: { addOns: { orderBy: { sortOrder: 'asc' } } } } } },
      media: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
    },
  });
  if (!item || item.deletedAt) throw new HttpError(404, 'Menu item not found', 'not_found');
  return apiSuccess(item);
});

export const PATCH = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: menuItemInputSchema },
  async ({ body, params, session }) => {
    const before = await prisma.menuItem.findUnique({
      where: { id: params.id },
      include: { variants: true, media: true },
    });
    if (!before || before.deletedAt) throw new HttpError(404, 'Menu item not found', 'not_found');

    const { variants, addOnGroupIds, mediaIds, ...fields } = body;

    const item = await prisma.$transaction(async (tx) => {
      // Variants referenced by past orders must survive an edit, so a variant
      // that disappears from the form is deactivated rather than deleted.
      const keepIds = variants.filter((v) => v.id).map((v) => v.id!);
      const removed = before.variants.filter((v) => !keepIds.includes(v.id));

      for (const variant of removed) {
        const used = await tx.orderItem.count({ where: { variantId: variant.id } });
        if (used > 0) {
          await tx.menuVariant.update({ where: { id: variant.id }, data: { isAvailable: false } });
        } else {
          await tx.menuVariant.delete({ where: { id: variant.id } });
        }
      }

      for (const [index, variant] of variants.entries()) {
        const data = {
          name: variant.name,
          code: variant.code ?? null,
          price: new Prisma.Decimal(variant.price),
          compareAtPrice: variant.compareAtPrice != null ? new Prisma.Decimal(variant.compareAtPrice) : null,
          isAvailable: variant.isAvailable,
          isDefault: variant.isDefault || (index === 0 && !variants.some((v) => v.isDefault)),
          portionLabel: variant.portionLabel ?? null,
          sortOrder: variant.sortOrder ?? index,
        };
        if (variant.id && before.variants.some((v) => v.id === variant.id)) {
          await tx.menuVariant.update({ where: { id: variant.id }, data });
        } else {
          await tx.menuVariant.create({ data: { ...data, menuItemId: params.id } });
        }
      }

      await tx.menuItemAddOnGroup.deleteMany({ where: { menuItemId: params.id } });
      if (addOnGroupIds.length) {
        await tx.menuItemAddOnGroup.createMany({
          data: addOnGroupIds.map((groupId, i) => ({ menuItemId: params.id, groupId, sortOrder: i })),
        });
      }

      const previousMediaIds = before.media.map((m) => m.mediaId);
      await tx.menuItemMedia.deleteMany({ where: { menuItemId: params.id } });
      if (mediaIds.length) {
        await tx.menuItemMedia.createMany({
          data: mediaIds.map((mediaId, i) => ({ menuItemId: params.id, mediaId, sortOrder: i, isPrimary: i === 0 })),
        });
      }

      const added = mediaIds.filter((id) => !previousMediaIds.includes(id));
      const dropped = previousMediaIds.filter((id) => !mediaIds.includes(id));
      if (added.length) {
        await tx.mediaAsset.updateMany({ where: { id: { in: added } }, data: { usageCount: { increment: 1 } } });
      }
      if (dropped.length) {
        await tx.mediaAsset.updateMany({ where: { id: { in: dropped } }, data: { usageCount: { decrement: 1 } } });
      }

      return tx.menuItem.update({
        where: { id: params.id },
        data: {
          ...fields,
          basePrice: fields.basePrice != null ? new Prisma.Decimal(fields.basePrice) : null,
        },
        include: { variants: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await audit({
      session,
      action: 'menu.item_updated',
      entity: 'MenuItem',
      entityId: item.id,
      before: { name: before.name, status: before.status, isAvailable: before.isAvailable },
      after: { name: item.name, status: item.status, isAvailable: item.isAvailable },
    });

    return apiSuccess(item);
  },
);

export const DELETE = route({ permission: PERMISSIONS.MENU_DELETE }, async ({ params, session }) => {
  const item = await prisma.menuItem.findUnique({ where: { id: params.id } });
  if (!item || item.deletedAt) throw new HttpError(404, 'Menu item not found', 'not_found');

  await prisma.menuItem.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'ARCHIVED', isAvailable: false },
  });

  await audit({
    session,
    action: 'menu.item_archived',
    entity: 'MenuItem',
    entityId: item.id,
    severity: 'MEDIUM',
    before: { name: item.name, slug: item.slug },
  });

  return apiSuccess({ archived: true });
});
