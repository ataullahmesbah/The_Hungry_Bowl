import { z } from 'zod';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { financeReport, inventoryReport, resolveRange, salesReport, staffReport } from '@/lib/service/reports';
import { HttpError } from '@/lib/auth/guard';

const querySchema = z.object({
  kind: z.enum(['sales', 'finance', 'inventory', 'staff']).default('sales'),
  preset: z.enum(['today', 'yesterday', 'week', 'month', 'year']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * Each report kind has its own permission, so a manager who may see sales does
 * not automatically get the profit-and-loss view.
 */
const PERMISSION_FOR = {
  sales: PERMISSIONS.REPORT_SALES,
  finance: PERMISSIONS.REPORT_FINANCE,
  inventory: PERMISSIONS.REPORT_INVENTORY,
  staff: PERMISSIONS.REPORT_SALES,
} as const;

export const GET = route(
  { permission: [PERMISSIONS.REPORT_SALES, PERMISSIONS.REPORT_FINANCE, PERMISSIONS.REPORT_INVENTORY], querySchema },
  async ({ query, session }) => {
    if (!session!.user.permissions.has(PERMISSION_FOR[query.kind])) {
      throw new HttpError(403, 'You do not have permission to view this report.', 'forbidden');
    }

    const settings = await getSettings();
    const range = resolveRange(settings.timezone, query);

    if (query.kind === 'inventory') return apiSuccess(await inventoryReport());
    if (query.kind === 'staff') return apiSuccess(await staffReport(range));
    if (query.kind === 'finance') return apiSuccess(await financeReport(range));
    return apiSuccess(await salesReport(range));
  },
);
