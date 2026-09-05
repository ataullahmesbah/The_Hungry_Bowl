import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { resolveRange } from '@/lib/service/reports';

const querySchema = z.object({
  preset: z.enum(['today', 'yesterday', 'week', 'month', 'year']).default('month'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Business analytics, PRD §15. */
export const GET = route(
  { permission: PERMISSIONS.REPORT_ANALYTICS, querySchema },
  async ({ query }) => {
    const settings = await getSettings();
    const range = resolveRange(settings.timezone, query);
    const { from, to } = range;

    const [
      orderStats,
      bestSellers,
      slowMovers,
      byWeekday,
      byHour,
      reservations,
      tableUse,
      ticketTimes,
      wastage,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { status: 'COMPLETED', completedAt: { gte: from, lte: to } },
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        _count: true,
      }),

      prisma.$queryRaw<{ item: string; quantity: number; total: number }[]>`
        SELECT oi."itemName" AS item,
               SUM(oi.quantity - oi."cancelledQty")::float8 AS quantity,
               SUM(oi."lineTotal")::float8 AS total
        FROM order_items oi JOIN orders o ON o.id = oi."orderId"
        WHERE o.status = 'COMPLETED' AND o."completedAt" BETWEEN ${from} AND ${to}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      `,

      // Published items that sold nothing in the window — the ones worth
      // questioning at the next menu review.
      prisma.$queryRaw<{ item: string; quantity: number }[]>`
        SELECT mi.name AS item, COALESCE(SUM(oi.quantity - oi."cancelledQty"), 0)::float8 AS quantity
        FROM menu_items mi
        LEFT JOIN order_items oi ON oi."menuItemId" = mi.id
          AND oi."orderId" IN (
            SELECT id FROM orders WHERE status = 'COMPLETED' AND "completedAt" BETWEEN ${from} AND ${to}
          )
        WHERE mi."deletedAt" IS NULL AND mi.status = 'PUBLISHED'
        GROUP BY 1 ORDER BY 2 ASC LIMIT 10
      `,

      prisma.$queryRaw<{ weekday: number; orders: bigint; total: number }[]>`
        SELECT EXTRACT(DOW FROM o."completedAt")::int AS weekday,
               COUNT(*)::bigint AS orders,
               COALESCE(SUM(o."totalAmount"), 0)::float8 AS total
        FROM orders o
        WHERE o.status = 'COMPLETED' AND o."completedAt" BETWEEN ${from} AND ${to}
        GROUP BY 1 ORDER BY 1
      `,

      prisma.$queryRaw<{ hour: number; orders: bigint; total: number }[]>`
        SELECT EXTRACT(HOUR FROM o."completedAt")::int AS hour,
               COUNT(*)::bigint AS orders,
               COALESCE(SUM(o."totalAmount"), 0)::float8 AS total
        FROM orders o
        WHERE o.status = 'COMPLETED' AND o."completedAt" BETWEEN ${from} AND ${to}
        GROUP BY 1 ORDER BY 1
      `,

      prisma.reservation.groupBy({
        by: ['status'],
        where: { reservedAt: { gte: from, lte: to }, deletedAt: null },
        _count: true,
        _sum: { guestCount: true },
      }),

      prisma.$queryRaw<{ table: string; sessions: bigint; guests: number; revenue: number }[]>`
        SELECT t.name AS table,
               COUNT(DISTINCT s.id)::bigint AS sessions,
               COALESCE(SUM(s."guestCount"), 0)::float8 AS guests,
               COALESCE(SUM(o."totalAmount"), 0)::float8 AS revenue
        FROM restaurant_tables t
        LEFT JOIN table_sessions s ON s."tableId" = t.id AND s."openedAt" BETWEEN ${from} AND ${to}
        LEFT JOIN orders o ON o."sessionId" = s.id AND o.status = 'COMPLETED'
        WHERE t."deletedAt" IS NULL
        GROUP BY 1 ORDER BY 4 DESC
      `,

      // How long the kitchen took, in minutes, from ticket to ready.
      prisma.$queryRaw<{ avg_minutes: number | null; max_minutes: number | null; tickets: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (k."readyAt" - k."receivedAt")) / 60)::float8 AS avg_minutes,
               MAX(EXTRACT(EPOCH FROM (k."readyAt" - k."receivedAt")) / 60)::float8 AS max_minutes,
               COUNT(*)::bigint AS tickets
        FROM kitchen_tickets k
        WHERE k."readyAt" IS NOT NULL AND k."receivedAt" BETWEEN ${from} AND ${to}
      `,

      prisma.stockMovement.aggregate({
        where: { type: 'WASTAGE', createdAt: { gte: from, lte: to } },
        _sum: { totalCost: true },
        _count: true,
      }),
    ]);

    const reservationTotals = reservations.reduce(
      (acc, row) => {
        acc.total += row._count;
        acc.guests += Number(row._sum.guestCount ?? 0);
        acc.byStatus[row.status] = row._count;
        return acc;
      },
      { total: 0, guests: 0, byStatus: {} as Record<string, number> },
    );

    const ticket = ticketTimes[0];

    return apiSuccess({
      range: { from: from.toISOString(), to: to.toISOString(), label: range.label },
      orders: {
        count: orderStats._count,
        total: Number(orderStats._sum.totalAmount ?? 0),
        averageOrderValue: Number(orderStats._avg.totalAmount ?? 0),
      },
      bestSellers: bestSellers.map((r) => ({ ...r, quantity: Number(r.quantity), total: Number(r.total) })),
      slowMovers: slowMovers.map((r) => ({ ...r, quantity: Number(r.quantity) })),
      byWeekday: byWeekday.map((r) => ({ weekday: r.weekday, orders: Number(r.orders), total: Number(r.total) })),
      byHour: byHour.map((r) => ({ hour: r.hour, orders: Number(r.orders), total: Number(r.total) })),
      reservations: reservationTotals,
      tableUse: tableUse.map((r) => ({
        table: r.table,
        sessions: Number(r.sessions),
        guests: Number(r.guests),
        revenue: Number(r.revenue),
      })),
      kitchen: {
        averageMinutes: ticket?.avg_minutes != null ? Number(ticket.avg_minutes.toFixed(1)) : null,
        slowestMinutes: ticket?.max_minutes != null ? Number(ticket.max_minutes.toFixed(1)) : null,
        tickets: Number(ticket?.tickets ?? 0),
      },
      wastage: { cost: Number(wastage._sum.totalCost ?? 0), events: wastage._count },
    });
  },
);
