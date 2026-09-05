import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { closingSchema } from '@/lib/validation/finance';
import { getSettings } from '@/lib/settings';
import { buildReconciliation } from '@/lib/service/reconciliation';
import { dec } from '@/lib/money';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(90).default(30),
});

export const GET = route(
  { permission: PERMISSIONS.FINANCE_VIEW, querySchema: listQuery },
  async ({ query }) =>
    apiSuccess(
      await prisma.dailyClosing.findMany({ orderBy: { businessDate: 'desc' }, take: query.limit }),
    ),
);

/**
 * Save the day's close.
 *
 * The reconciliation is recomputed here rather than trusted from the request,
 * so what is stored is what the books actually say. The counted figures the
 * manager typed are kept alongside it, and a mismatch is recorded and
 * escalated rather than smoothed over.
 */
export const POST = route(
  { permission: PERMISSIONS.FINANCE_CLOSE_DAY, bodySchema: closingSchema },
  async ({ body, session }) => {
    const settings = await getSettings();
    const report = await buildReconciliation(body.businessDate, settings.timezone, body.countedByMethod);

    const countedTotal = Object.values(body.countedByMethod).reduce((sum, value) => sum + value, 0);
    const recordedTotal = report.payments.net;
    const varianceTotal = Number((countedTotal - recordedTotal).toFixed(2));

    const closing = await prisma.dailyClosing.upsert({
      where: { businessDate: new Date(`${body.businessDate}T00:00:00.000Z`) },
      create: {
        businessDate: new Date(`${body.businessDate}T00:00:00.000Z`),
        expectedTotal: dec(report.orders.salesTotal),
        recordedTotal: dec(recordedTotal),
        varianceTotal: dec(varianceTotal),
        breakdown: JSON.parse(JSON.stringify(report)),
        orderCount: report.orders.completed,
        note: body.note?.trim() || null,
        closedById: session!.user.id,
      },
      update: {
        expectedTotal: dec(report.orders.salesTotal),
        recordedTotal: dec(recordedTotal),
        varianceTotal: dec(varianceTotal),
        breakdown: JSON.parse(JSON.stringify(report)),
        orderCount: report.orders.completed,
        note: body.note?.trim() || null,
        closedById: session!.user.id,
        closedAt: new Date(),
      },
    });

    const cashMismatch = Math.abs(varianceTotal) > 0.5 && countedTotal > 0;

    if (report.hasMismatch || cashMismatch || report.unpaidOrders.length > 0) {
      await notify({
        type: 'finance.closing_mismatch',
        title: `Day close for ${body.businessDate} needs attention`,
        body: [
          report.hasMismatch
            ? `Sales and payments differ by ${report.variance.toFixed(2)}.`
            : null,
          cashMismatch ? `Counted cash differs from recorded by ${varianceTotal.toFixed(2)}.` : null,
          report.unpaidOrders.length > 0 ? `${report.unpaidOrders.length} order(s) still unpaid.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        level: 'WARNING',
        href: '/dashboard/finance/closing',
        permissions: [PERMISSIONS.FINANCE_VIEW],
      });
    }

    await audit({
      session,
      action: 'finance.day_closed',
      entity: 'DailyClosing',
      entityId: closing.id,
      severity: 'HIGH',
      after: {
        businessDate: body.businessDate,
        sales: report.orders.salesTotal,
        payments: recordedTotal,
        counted: countedTotal,
        variance: varianceTotal,
      },
    });

    return apiSuccess({ closing, report, varianceTotal }, { status: 201 });
  },
);
