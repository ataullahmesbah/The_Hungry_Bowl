import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { menuItemInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({
  search: z.string().max(120).optional(),
  categoryId: z.string().cuid().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  availability: z.enum(['available', 'unavailable']).optional(),
  flag: z.enum(['featured', 'special', 'new']).optional(),
});

export const GET = route(
  { permission: PERMISSIONS.MENU_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.MenuItemWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.availability ? { isAvailable: query.availability === 'available' } : {}),
      ...(query.flag === 'featured' ? { isFeatured: true } : {}),
      ...(query.flag === 'special' ? { isTodaysSpecial: true } : {}),
      ...(query.flag === 'new' ? { isNew: true } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { shortDescription: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...paginate(query),
        include: {
          category: { select: { id: true, name: true, slug: true } },
          variants: { orderBy: { sortOrder: 'asc' } },
          media: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            include: { media: { select: { secureUrl: true, altText: true } } },
          },
        },
      }),
      prisma.menuItem.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

export const POST = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: menuItemInputSchema },
  async ({ body, session }) => {
    const { variants, addOnGroupIds, mediaIds, ...fields } = body;

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          ...fields,
          basePrice: fields.basePrice != null ? new Prisma.Decimal(fields.basePrice) : null,
          createdById: session!.user.id,
          variants: {
            create: variants.map((v, index) => ({
              name: v.name,
              code: v.code ?? null,
              price: new Prisma.Decimal(v.price),
              compareAtPrice: v.compareAtPrice != null ? new Prisma.Decimal(v.compareAtPrice) : null,
              isAvailable: v.isAvailable,
              isDefault: v.isDefault || index === 0,
              portionLabel: v.portionLabel ?? null,
              sortOrder: v.sortOrder ?? index,
            })),
          },
          addOnGroups: { create: addOnGroupIds.map((groupId, i) => ({ groupId, sortOrder: i })) },
          media: {
            create: mediaIds.map((mediaId, i) => ({ mediaId, sortOrder: i, isPrimary: i === 0 })),
          },
        },
        include: { variants: true },
      });

      if (mediaIds.length) {
        await tx.mediaAsset.updateMany({ where: { id: { in: mediaIds } }, data: { usageCount: { increment: 1 } } });
      }

      return created;
    });

    await audit({
      session,
      action: 'menu.item_created',
      entity: 'MenuItem',
      entityId: item.id,
      after: { name: item.name, slug: item.slug, status: item.status },
    });

    return apiSuccess(item, { status: 201 });
  },
);
