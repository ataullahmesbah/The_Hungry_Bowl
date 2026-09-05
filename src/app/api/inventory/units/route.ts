import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { unitSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';

export const GET = route({ permission: PERMISSIONS.INVENTORY_VIEW }, async () =>
  apiSuccess(await prisma.unit.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })),
);

export const POST = route(
  { permission: PERMISSIONS.INVENTORY_MANAGE, bodySchema: unitSchema },
  async ({ body, session }) => {
    const unit = await prisma.unit.create({
      data: { ...body, toBase: new Prisma.Decimal(body.toBase) },
    });
    await audit({ session, action: 'inventory.unit_created', entity: 'Unit', entityId: unit.id, after: body });
    return apiSuccess(unit, { status: 201 });
  },
);
