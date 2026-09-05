import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { expenseSchema } from '@/lib/validation/finance';
import { dec } from '@/lib/money';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const PATCH = route(
  { permission: PERMISSIONS.FINANCE_MANAGE, bodySchema: expenseSchema.partial() },
  async ({ body, params, session }) => {
    const before = await prisma.expense.findUnique({ where: { id: params.id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Expense not found', 'not_found');

    const expense = await prisma.expense.update({
      where: { id: params.id },
      data: {
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.amount !== undefined ? { amount: dec(body.amount) } : {}),
        ...(body.expenseDate ? { expenseDate: new Date(body.expenseDate) } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
    });

    // Editing money is always high severity, with both figures kept.
    await audit({
      session,
      action: 'finance.expense_updated',
      entity: 'Expense',
      entityId: expense.id,
      severity: 'HIGH',
      before: { title: before.title, amount: Number(before.amount) },
      after: { title: expense.title, amount: Number(expense.amount) },
    });

    return apiSuccess(expense);
  },
);

export const DELETE = route({ permission: PERMISSIONS.FINANCE_MANAGE }, async ({ params, session }) => {
  const expense = await prisma.expense.findUnique({ where: { id: params.id } });
  if (!expense || expense.deletedAt) throw new HttpError(404, 'Expense not found', 'not_found');

  await prisma.expense.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await audit({
    session,
    action: 'finance.expense_deleted',
    entity: 'Expense',
    entityId: params.id,
    severity: 'HIGH',
    before: { title: expense.title, amount: Number(expense.amount) },
  });
  return apiSuccess({ deleted: true });
});
