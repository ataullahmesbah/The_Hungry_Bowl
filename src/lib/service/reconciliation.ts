import 'server-only';
import { prisma } from '@/lib/db';
import { businessDateKey } from './orders';

export interface MethodLine {
  methodId: string;
  method: string;
  kind: string;
  expected: number;
  counted: number | null;
  variance: number | null;
  paymentCount: number;
}

export interface Reconciliation {
  businessDate: string;
  range: { from: string; to: string };
  orders: { completed: number; cancelled: number; salesTotal: number };
  payments: { received: number; refunded: number; net: number };
  /** Completed order totals minus recorded payments. */
  variance: number;
  hasMismatch: boolean;
  unpaidOrders: { id: string; orderNumber: string; total: number; due: number; table: string | null }[];
  byMethod: MethodLine[];
  expenses: { total: number; byCategory: { name: string; total: number }[] };
  otherIncome: number;
  purchases: number;
  foodCost: number;
  profit: { gross: number; net: number };
}

/** Start and end of one business day in the restaurant's own timezone. */
export function businessDayRange(businessDate: string, timezone: string): { from: Date; to: Date } {
  // Build the local midnight, then find what UTC instant that is by measuring
  // the zone's offset at that moment. Doing it this way keeps the close honest
  // for a restaurant whose day does not line up with the server's.
  const naive = new Date(`${businessDate}T00:00:00Z`);
  const offsetMs = zoneOffsetMs(naive, timezone);
  const from = new Date(naive.getTime() - offsetMs);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from, to };
}

function zoneOffsetMs(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

/**
 * The end-of-day close, PRD §11.
 *
 * The point of this screen is the variance line. Completed order totals and
 * recorded payments are computed independently and then compared; when they
 * disagree the difference is shown rather than quietly absorbed, because a
 * mismatch is exactly the thing an owner needs to see.
 */
export async function buildReconciliation(
  businessDate: string,
  timezone: string,
  countedByMethod: Record<string, number> = {},
): Promise<Reconciliation> {
  const { from, to } = businessDayRange(businessDate, timezone);

  const [completedOrders, cancelledCount, payments, methods, expenses, expenseGroups, income, purchases, unpaid, consumption] =
    await Promise.all([
      prisma.order.aggregate({
        where: { status: 'COMPLETED', completedAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.order.count({ where: { status: 'CANCELLED', cancelledAt: { gte: from, lte: to } } }),
      prisma.payment.groupBy({
        by: ['methodId'],
        where: { status: { in: ['COMPLETED', 'REFUNDED'] }, receivedAt: { gte: from, lte: to } },
        _sum: { amount: true, refundedAmount: true },
        _count: true,
      }),
      prisma.paymentMethod.findMany({ select: { id: true, name: true, kind: true } }),
      prisma.expense.aggregate({
        where: { deletedAt: null, expenseDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, expenseDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.incomeEntry.aggregate({
        where: { deletedAt: null, kind: 'OTHER', entryDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.purchase.aggregate({
        where: { status: { not: 'CANCELLED' }, purchaseDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      prisma.order.findMany({
        where: {
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          dueAmount: { gt: 0 },
          createdAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          dueAmount: true,
          table: { select: { name: true } },
        },
      }),
      prisma.stockMovement.aggregate({
        where: { type: 'CONSUMPTION', createdAt: { gte: from, lte: to } },
        _sum: { totalCost: true },
      }),
    ]);

  const methodNames = new Map(methods.map((m) => [m.id, m]));

  const byMethod: MethodLine[] = payments.map((row) => {
    const expected = Number(row._sum.amount ?? 0) - Number(row._sum.refundedAmount ?? 0);
    const counted = countedByMethod[row.methodId];
    return {
      methodId: row.methodId,
      method: methodNames.get(row.methodId)?.name ?? 'Unknown',
      kind: methodNames.get(row.methodId)?.kind ?? 'OTHER',
      expected: Number(expected.toFixed(2)),
      counted: counted != null ? Number(counted.toFixed(2)) : null,
      variance: counted != null ? Number((counted - expected).toFixed(2)) : null,
      paymentCount: row._count,
    };
  });

  const received = payments.reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const refunded = payments.reduce((sum, row) => sum + Number(row._sum.refundedAmount ?? 0), 0);
  const net = received - refunded;
  const salesTotal = Number(completedOrders._sum.totalAmount ?? 0);

  const expenseTotal = Number(expenses._sum.amount ?? 0);
  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: expenseGroups.map((g) => g.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const foodCost = Number(consumption._sum.totalCost ?? 0);
  const otherIncome = Number(income._sum.amount ?? 0);

  const variance = Number((salesTotal - net).toFixed(2));

  return {
    businessDate,
    range: { from: from.toISOString(), to: to.toISOString() },
    orders: {
      completed: completedOrders._count,
      cancelled: cancelledCount,
      salesTotal: Number(salesTotal.toFixed(2)),
    },
    payments: {
      received: Number(received.toFixed(2)),
      refunded: Number(refunded.toFixed(2)),
      net: Number(net.toFixed(2)),
    },
    variance,
    // A rounding unit of slack; anything larger is a genuine mismatch.
    hasMismatch: Math.abs(variance) > 0.5,
    unpaidOrders: unpaid.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.totalAmount),
      due: Number(order.dueAmount),
      table: order.table?.name ?? null,
    })),
    byMethod: byMethod.sort((a, b) => b.expected - a.expected),
    expenses: {
      total: Number(expenseTotal.toFixed(2)),
      byCategory: expenseGroups
        .map((group) => ({
          name: categoryNames.get(group.categoryId) ?? 'Unknown',
          total: Number(Number(group._sum.amount ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.total - a.total),
    },
    otherIncome: Number(otherIncome.toFixed(2)),
    purchases: Number(Number(purchases._sum.totalAmount ?? 0).toFixed(2)),
    foodCost: Number(foodCost.toFixed(2)),
    profit: {
      gross: Number((salesTotal - foodCost).toFixed(2)),
      net: Number((salesTotal + otherIncome - foodCost - expenseTotal).toFixed(2)),
    },
  };
}

export function todayBusinessDate(timezone: string): string {
  return businessDateKey(timezone);
}
