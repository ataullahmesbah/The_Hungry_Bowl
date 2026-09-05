import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { customerInputSchema } from '@/lib/validation/service';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({ search: z.string().max(120).optional() });

export const GET = route(
  { permission: PERMISSIONS.CUSTOMER_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: [{ lastVisitAt: 'desc' }, { name: 'asc' }],
        ...paginate(query),
      }),
      prisma.customer.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

export const POST = route(
  { permission: PERMISSIONS.CUSTOMER_MANAGE, bodySchema: customerInputSchema },
  async ({ body, session }) => {
    const customer = await prisma.customer.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    await audit({ session, action: 'customer.created', entity: 'Customer', entityId: customer.id, after: { name: customer.name } });
    return apiSuccess(customer, { status: 201 });
  },
);
