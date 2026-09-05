import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { CustomersManager } from './customers-manager';

export const metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const session = await requirePagePermission(PERMISSIONS.CUSTOMER_VIEW, '/dashboard/customers');
  const settings = await getSettings();

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: [{ lastVisitAt: 'desc' }, { name: 'asc' }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Regulars, their contact details and how often they visit."
      />
      <CustomersManager
        customers={serialize(customers)}
        currency={toPublicSettings(settings)}
        timezone={settings.timezone}
        locale={settings.locale}
        canManage={session.user.permissions.has(PERMISSIONS.CUSTOMER_MANAGE)}
      />
    </div>
  );
}
