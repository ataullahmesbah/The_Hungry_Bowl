import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { supplierSchema } from '@/lib/validation/inventory';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({ search: z.string().max(120).optional() });

export const GET = route(
  { permission: PERMISSIONS.PURCHASE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        ...paginate(query),
        include: { _count: { select: { purchases: true } } },
      }),
      prisma.supplier.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

export const POST = route(
  { permission: PERMISSIONS.SUPPLIER_MANAGE, bodySchema: supplierSchema },
  async ({ body, session }) => {
    const supplier = await prisma.supplier.create({
      data: { ...body, email: body.email?.trim() || null },
    });
    await audit({ session, action: 'purchasing.supplier_created', entity: 'Supplier', entityId: supplier.id, after: { name: supplier.name } });
    return apiSuccess(supplier, { status: 201 });
  },
);
