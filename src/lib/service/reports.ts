import 'server-only';
import { prisma } from '@/lib/db';
import { businessDayRange } from './reconciliation';
import { businessDateKey } from './orders';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

/** Turn a preset or explicit dates into a range in the restaurant's timezone. */
export function resolveRange(
  timezone: string,
  input: { preset?: string; from?: string; to?: string },
): DateRange {
  if (input.from || input.to) {
    return {
      from: input.from ? new Date(input.from) : new Date(Date.now() - 30 * 86400_000),
      to: input.to ? new Date(input.to) : new Date(),
      label: 'Custom range',
    };
  }

  const today = businessDateKey(timezone);
  const dayRange = businessDayRange(today, timezone);

  switch (input.preset) {
    case 'yesterday': {
      const from = new Date(dayRange.from.getTime() - 86400_000);
      return { from, to: new Date(dayRange.from.getTime() - 1), label: 'Yesterday' };
    }
    case 'week':
      return { from: new Date(dayRange.to.getTime() - 7 * 86400_000), to: dayRange.to, label: 'Last 7 days' };
    case 'month':
      return { from: new Date(dayRange.to.getTime() - 30 * 86400_000), to: dayRange.to, label: 'Last 30 days' };
    case 'year':
      return { from: new Date(dayRange.to.getTime() - 365 * 86400_000), to: dayRange.to, label: 'Last 12 months' };
    default:
      return { from: dayRange.from, to: dayRange.to, label: 'Today' };
  }
}

/**
 * Sales report.
 *
 * Everything is derived from completed orders — the same source the daily
 * close uses — so a figure here and a figure there can never disagree.
 */
export async function salesReport(range: DateRange) {
  const where = { status: 'COMPLETED' as const, completedAt: { gte: range.from, lte: range.to } };

  const [summary, byDay, byCategory, byItem, byMethod, byHour] = await Promise.all([
    prisma.order.aggregate({
      where,
      _sum: { subtotal: true, discountAmount: true, taxAmount: true, serviceChargeAmount: true, totalAmount: true },
      _count: true,
      _avg: { totalAmount: true },
    }),

    prisma.$queryRaw<{ day: Date; orders: bigint; total: number }[]>`
      SELECT date_trunc('day', o."completedAt") AS day,
             COUNT(*)::bigint AS orders,
             COALESCE(SUM(o."totalAmount"), 0)::float8 AS total
      FROM orders o
      WHERE o.status = 'COMPLETED'
        AND o."completedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1 ORDER BY 1 ASC
    `,

    prisma.$queryRaw<{ category: string; quantity: number; total: number }[]>`
      SELECT COALESCE(c.name, 'Uncategorised') AS category,
             COALESCE(SUM(oi.quantity - oi."cancelledQty"), 0)::float8 AS quantity,
             COALESCE(SUM(oi."lineTotal"), 0)::float8 AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      LEFT JOIN menu_items mi ON mi.id = oi."menuItemId"
      LEFT JOIN menu_categories c ON c.id = mi."categoryId"
      WHERE o.status = 'COMPLETED'
        AND o."completedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1 ORDER BY 3 DESC
    `,

    prisma.$queryRaw<{ item: string; variant: string | null; quantity: number; total: number }[]>`
      SELECT oi."itemName" AS item,
             oi."variantName" AS variant,
             COALESCE(SUM(oi.quantity - oi."cancelledQty"), 0)::float8 AS quantity,
             COALESCE(SUM(oi."lineTotal"), 0)::float8 AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o.status = 'COMPLETED'
        AND o."completedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40
    `,

    prisma.payment.groupBy({
      by: ['methodId'],
      where: { status: { in: ['COMPLETED', 'REFUNDED'] }, receivedAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true, refundedAmount: true },
      _count: true,
    }),

    prisma.$queryRaw<{ hour: number; orders: bigint; total: number }[]>`
      SELECT EXTRACT(HOUR FROM o."completedAt")::int AS hour,
             COUNT(*)::bigint AS orders,
             COALESCE(SUM(o."totalAmount"), 0)::float8 AS total
      FROM orders o
      WHERE o.status = 'COMPLETED'
        AND o."completedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1 ORDER BY 1 ASC
    `,
  ]);

  const methods = await prisma.paymentMethod.findMany({
    where: { id: { in: byMethod.map((m) => m.methodId) } },
    select: { id: true, name: true },
  });
  const methodNames = new Map(methods.map((m) => [m.id, m.name]));

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    summary: {
      orders: summary._count,
      subtotal: Number(summary._sum.subtotal ?? 0),
      discount: Number(summary._sum.discountAmount ?? 0),
      tax: Number(summary._sum.taxAmount ?? 0),
      serviceCharge: Number(summary._sum.serviceChargeAmount ?? 0),
      total: Number(summary._sum.totalAmount ?? 0),
      averageOrder: Number(summary._avg.totalAmount ?? 0),
    },
    byDay: byDay.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      orders: Number(row.orders),
      total: Number(row.total),
    })),
    byCategory: byCategory.map((row) => ({ ...row, quantity: Number(row.quantity), total: Number(row.total) })),
    byItem: byItem.map((row) => ({ ...row, quantity: Number(row.quantity), total: Number(row.total) })),
    byHour: byHour.map((row) => ({ hour: row.hour, orders: Number(row.orders), total: Number(row.total) })),
    byMethod: byMethod
      .map((row) => ({
        method: methodNames.get(row.methodId) ?? 'Unknown',
        total: Number(row._sum.amount ?? 0) - Number(row._sum.refundedAmount ?? 0),
        count: row._count,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

export async function financeReport(range: DateRange) {
  const [sales, expenses, expenseGroups, purchases, foodCost, otherIncome] = await Promise.all([
    prisma.order.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: range.from, lte: range.to } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { deletedAt: null, expenseDate: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null, expenseDate: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { status: { not: 'CANCELLED' }, purchaseDate: { gte: range.from, lte: range.to } },
      _sum: { totalAmount: true },
    }),
    prisma.stockMovement.aggregate({
      where: { type: 'CONSUMPTION', createdAt: { gte: range.from, lte: range.to } },
      _sum: { totalCost: true },
    }),
    prisma.incomeEntry.aggregate({
      where: { deletedAt: null, kind: 'OTHER', entryDate: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
  ]);

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: expenseGroups.map((g) => g.categoryId) } },
    select: { id: true, name: true, kind: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));

  const salesTotal = Number(sales._sum.totalAmount ?? 0);
  const expenseTotal = Number(expenses._sum.amount ?? 0);
  const food = Number(foodCost._sum.totalCost ?? 0);
  const other = Number(otherIncome._sum.amount ?? 0);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    income: { sales: salesTotal, other, total: salesTotal + other },
    costs: {
      foodCost: food,
      expenses: expenseTotal,
      purchases: Number(purchases._sum.totalAmount ?? 0),
      total: food + expenseTotal,
    },
    expensesByCategory: expenseGroups
      .map((group) => ({
        name: byId.get(group.categoryId)?.name ?? 'Unknown',
        kind: byId.get(group.categoryId)?.kind ?? 'OTHER',
        total: Number(group._sum.amount ?? 0),
      }))
      .sort((a, b) => b.total - a.total),
    profit: {
      gross: salesTotal - food,
      grossPercent: salesTotal > 0 ? ((salesTotal - food) / salesTotal) * 100 : 0,
      net: salesTotal + other - food - expenseTotal,
      netPercent: salesTotal > 0 ? ((salesTotal + other - food - expenseTotal) / salesTotal) * 100 : 0,
    },
    orderCount: sales._count,
  };
}

export async function inventoryReport() {
  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      avgUnitCost: true,
      reorderLevel: true,
      unit: { select: { code: true } },
      category: { select: { name: true } },
      balances: { select: { quantity: true, warehouse: { select: { name: true } } } },
    },
  });

  const rows = items.map((item) => {
    const quantity = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
    return {
      id: item.id,
      name: item.name,
      category: item.category?.name ?? 'Uncategorised',
      unit: item.unit.code,
      quantity: Number(quantity.toFixed(3)),
      unitCost: Number(item.avgUnitCost),
      value: Number((quantity * Number(item.avgUnitCost)).toFixed(2)),
      isLow: Number(item.reorderLevel) > 0 && quantity <= Number(item.reorderLevel),
    };
  });

  return {
    items: rows.sort((a, b) => b.value - a.value),
    totalValue: Number(rows.reduce((sum, r) => sum + r.value, 0).toFixed(2)),
    lowCount: rows.filter((r) => r.isLow).length,
  };
}

/**
 * Staff report — who took the orders.
 *
 * `waiterId` is stamped on every internal order from the session that created
 * it, so this needs no extra data entry and cannot be gamed by whoever writes
 * the report. Only settled orders count: an order still open or cancelled is
 * not a sale anyone should get credit for.
 */
export async function staffReport(range: DateRange) {
  const orders = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: range.from, lte: range.to },
    },
    select: {
      totalAmount: true,
      guestCount: true,
      tableId: true,
      waiterId: true,
      createdById: true,
    },
  });

  // waiterId is a plain column, not a relation, so names are resolved in one
  // extra query rather than joining on every order row.
  const staffIds = [
    ...new Set(orders.map((o) => o.waiterId ?? o.createdById).filter((id): id is string => Boolean(id))),
  ];
  const people = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameById = new Map(people.map((p) => [p.id, p.name || p.email]));

  const byStaff = new Map<
    string,
    { id: string; name: string; orders: number; sales: number; guests: number; tables: Set<string> }
  >();

  for (const order of orders) {
    const id = order.waiterId ?? order.createdById ?? 'unassigned';
    let row = byStaff.get(id);
    if (!row) {
      row = {
        id,
        name: nameById.get(id) ?? 'Not recorded',
        orders: 0,
        sales: 0,
        guests: 0,
        tables: new Set<string>(),
      };
      byStaff.set(id, row);
    }
    row.orders += 1;
    row.sales += Number(order.totalAmount);
    row.guests += order.guestCount ?? 0;
    if (order.tableId) row.tables.add(order.tableId);
  }

  const rows = [...byStaff.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      orders: row.orders,
      sales: Number(row.sales.toFixed(2)),
      guests: row.guests,
      tables: row.tables.size,
      averageOrder: Number((row.sales / Math.max(1, row.orders)).toFixed(2)),
    }))
    .sort((a, b) => b.sales - a.sales);

  return {
    range: { label: range.label },
    rows,
    summary: {
      staff: rows.length,
      orders: rows.reduce((sum, r) => sum + r.orders, 0),
      sales: Number(rows.reduce((sum, r) => sum + r.sales, 0).toFixed(2)),
    },
  };
}
