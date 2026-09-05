import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { incomeSchema } from '@/lib/validation/finance';
import { dec } from '@/lib/money';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.FINANCE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where = {
      deletedAt: null,
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total, sum] = await Promise.all([
      prisma.incomeEntry.findMany({ where, orderBy: { entryDate: 'desc' }, ...paginate(query) }),
      prisma.incomeEntry.count({ where }),
      prisma.incomeEntry.aggregate({ where, _sum: { amount: true } }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query), total: Number(sum._sum.amount ?? 0) });
  },
);

/**
 * Other income only — restaurant sales come from completed orders and are
 * never entered by hand, so the two can never double-count.
 */
export const POST = route(
  { permission: PERMISSIONS.FINANCE_MANAGE, bodySchema: incomeSchema },
  async ({ body, session }) => {
    const entry = await prisma.incomeEntry.create({
      data: {
        title: body.title.trim(),
        kind: body.kind,
        amount: dec(body.amount),
        entryDate: new Date(body.entryDate),
        reference: body.reference?.trim() || null,
        note: body.note?.trim() || null,
        recordedById: session!.user.id,
      },
    });

    await audit({
      session,
      action: 'finance.income_recorded',
      entity: 'IncomeEntry',
      entityId: entry.id,
      severity: 'MEDIUM',
      after: { title: entry.title, amount: Number(entry.amount) },
    });

    return apiSuccess(entry, { status: 201 });
  },
);
