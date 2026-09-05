import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { addOnGroupInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.MENU_VIEW }, async () => {
  const groups = await prisma.addOnGroup.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      addOns: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { menuItems: true } },
    },
  });
  return apiSuccess(groups);
});

export const POST = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: addOnGroupInputSchema },
  async ({ body, session }) => {
    const { addOns, ...fields } = body;
    const group = await prisma.addOnGroup.create({
      data: {
        ...fields,
        addOns: {
          create: addOns.map((a, index) => ({
            name: a.name,
            price: new Prisma.Decimal(a.price),
            isAvailable: a.isAvailable,
            isDefault: a.isDefault,
            sortOrder: a.sortOrder ?? index,
          })),
        },
      },
      include: { addOns: true },
    });

    await audit({ session, action: 'menu.addon_group_created', entity: 'AddOnGroup', entityId: group.id, after: fields });
    return apiSuccess(group, { status: 201 });
  },
);
