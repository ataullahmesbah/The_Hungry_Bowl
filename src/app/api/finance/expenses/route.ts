import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { expenseSchema } from '@/lib/validation/finance';
import { dec } from '@/lib/money';
import { audit } from '@/lib/audit';

const listQuery = paginationSchema.extend({
  categoryId: z.string().cuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(120).optional(),
});

export const GET = route(
  { permission: PERMISSIONS.FINANCE_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.from || query.to
        ? {
            expenseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total, sum, byCategory] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        ...paginate(query),
        include: { category: { select: { id: true, name: true, kind: true } } },
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { amount: true }, _count: true }),
    ]);

    const categories = await prisma.expenseCategory.findMany({
      where: { id: { in: byCategory.map((c) => c.categoryId) } },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map((c) => [c.id, c.name]));

    return apiSuccess({
      items,
      meta: pageMeta(total, query),
      total: Number(sum._sum.amount ?? 0),
      byCategory: byCategory.map((row) => ({
        categoryId: row.categoryId,
        name: names.get(row.categoryId) ?? 'Unknown',
        total: Number(row._sum.amount ?? 0),
        count: row._count,
      })),
    });
  },
);

export const POST = route(
  { permission: PERMISSIONS.FINANCE_MANAGE, bodySchema: expenseSchema },
  async ({ body, session }) => {
    const expense = await prisma.expense.create({
      data: {
        categoryId: body.categoryId,
        title: body.title.trim(),
        amount: dec(body.amount),
        expenseDate: new Date(body.expenseDate),
        methodId: body.methodId ?? null,
        reference: body.reference?.trim() || null,
        note: body.note?.trim() || null,
        attachmentUrl: body.attachmentUrl ?? null,
        supplierId: body.supplierId ?? null,
        recordedById: session!.user.id,
      },
      include: { category: { select: { name: true } } },
    });

    await audit({
      session,
      action: 'finance.expense_recorded',
      entity: 'Expense',
      entityId: expense.id,
      severity: 'MEDIUM',
      after: { title: expense.title, amount: Number(expense.amount), category: expense.category.name },
    });

    return apiSuccess(expense, { status: 201 });
  },
);
