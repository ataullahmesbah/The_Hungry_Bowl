import { startOfMonth, endOfMonth } from 'date-fns';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { ExpensesManager } from './expenses-manager';

export const metadata = { title: 'Expenses' };
export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const session = await requirePagePermission(PERMISSIONS.FINANCE_VIEW, '/dashboard/finance/expenses');
  const settings = await getSettings();

  const now = new Date();

  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({
      where: { deletedAt: null, expenseDate: { gte: startOfMonth(now), lte: endOfMonth(now) } },
      orderBy: { expenseDate: 'desc' },
      take: 200,
      include: { category: { select: { id: true, name: true, kind: true } } },
    }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <div>
      <PageHeader title="Expenses" description="Everything the restaurant paid out this month." />
      <ExpensesManager
        expenses={serialize(expenses)}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        currency={toPublicSettings(settings)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManage={session.user.permissions.has(PERMISSIONS.FINANCE_MANAGE)}
      />
    </div>
  );
}
