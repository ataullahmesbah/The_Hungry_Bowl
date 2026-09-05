import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { addOnGroupInputSchema } from '@/lib/validation/menu';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.MENU_MANAGE, bodySchema: addOnGroupInputSchema },
  async ({ body, params, session }) => {
    const before = await prisma.addOnGroup.findUnique({
      where: { id: params.id },
      include: { addOns: true },
    });
    if (!before || before.deletedAt) throw new HttpError(404, 'Add-on group not found', 'not_found');

    const { addOns, ...fields } = body;

    const group = await prisma.$transaction(async (tx) => {
      const keepIds = addOns.filter((a) => a.id).map((a) => a.id!);

      // An add-on chosen on a past order is kept but hidden, so old receipts
      // still resolve their option names.
      for (const existing of before.addOns.filter((a) => !keepIds.includes(a.id))) {
        const used = await tx.orderItemOption.count({ where: { addOnId: existing.id } });
        if (used > 0) {
          await tx.addOn.update({ where: { id: existing.id }, data: { isAvailable: false } });
        } else {
          await tx.addOn.delete({ where: { id: existing.id } });
        }
      }

      for (const [index, addOn] of addOns.entries()) {
        const data = {
          name: addOn.name,
          price: new Prisma.Decimal(addOn.price),
          isAvailable: addOn.isAvailable,
          isDefault: addOn.isDefault,
          sortOrder: addOn.sortOrder ?? index,
        };
        if (addOn.id && before.addOns.some((a) => a.id === addOn.id)) {
          await tx.addOn.update({ where: { id: addOn.id }, data });
        } else {
          await tx.addOn.create({ data: { ...data, groupId: params.id } });
        }
      }

      return tx.addOnGroup.update({
        where: { id: params.id },
        data: fields,
        include: { addOns: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await audit({ session, action: 'menu.addon_group_updated', entity: 'AddOnGroup', entityId: group.id, before: fields, after: group });
    return apiSuccess(group);
  },
);

export const DELETE = route({ permission: PERMISSIONS.MENU_MANAGE }, async ({ params, session }) => {
  const group = await prisma.addOnGroup.findUnique({
    where: { id: params.id },
    include: { _count: { select: { menuItems: true } } },
  });
  if (!group || group.deletedAt) throw new HttpError(404, 'Add-on group not found', 'not_found');

  if (group._count.menuItems > 0) {
    throw new HttpError(
      409,
      `This group is attached to ${group._count.menuItems} menu item(s). Remove it from them first.`,
      'group_in_use',
    );
  }

  await prisma.addOnGroup.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await audit({ session, action: 'menu.addon_group_archived', entity: 'AddOnGroup', entityId: params.id, severity: 'MEDIUM' });
  return apiSuccess({ archived: true });
});
