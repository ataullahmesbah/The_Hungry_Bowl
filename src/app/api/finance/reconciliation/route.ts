import { z } from 'zod';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { buildReconciliation, todayBusinessDate } from '@/lib/service/reconciliation';

const querySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GET = route(
  { permission: PERMISSIONS.FINANCE_VIEW, querySchema },
  async ({ query }) => {
    const settings = await getSettings();
    const businessDate = query.businessDate ?? todayBusinessDate(settings.timezone);
    return apiSuccess(await buildReconciliation(businessDate, settings.timezone));
  },
);
