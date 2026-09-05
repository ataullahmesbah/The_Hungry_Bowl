import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { SuppliersManager } from './suppliers-manager';

export const metadata = { title: 'Suppliers' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const session = await requirePagePermission(PERMISSIONS.PURCHASE_VIEW, '/dashboard/suppliers');
  const settings = await getSettings();

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { purchases: true } } },
  });

  return (
    <div>
      <PageHeader title="Suppliers" description="Who you buy from, and what you still owe them." />
      <SuppliersManager
        suppliers={serialize(suppliers)}
        currency={toPublicSettings(settings)}
        canManage={session.user.permissions.has(PERMISSIONS.SUPPLIER_MANAGE)}
      />
    </div>
  );
}
