import Link from 'next/link';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader, Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { OrdersTable } from './orders-table';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.ORDER_VIEW, '/dashboard/orders');
  const params = await searchParams;
  const settings = await getSettings();

  const orders = await prisma.order.findMany({
    where: {
      ...(params.status === 'active' ? { status: { in: [...ACTIVE] } } : {}),
      ...(params.status && params.status !== 'active'
        ? { status: params.status as 'COMPLETED' | 'CANCELLED' | 'DRAFT' }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: {
      id: true,
      orderNumber: true,
      secretCode: true,
      type: true,
      status: true,
      paymentState: true,
      totalAmount: true,
      dueAmount: true,
      guestName: true,
      createdAt: true,
      table: { select: { name: true } },
      session: { select: { code: true } },
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order taken in the restaurant. There is no online ordering."
        actions={
          session.user.permissions.has(PERMISSIONS.ORDER_CREATE) ? (
            <Link href="/dashboard/orders/new">
              <Button>
                <Plus className="h-4 w-4" />
                New order
              </Button>
            </Link>
          ) : null
        }
      />
      <Card>
        <OrdersTable
          orders={serialize(orders)}
          currency={toPublicSettings(settings)}
          timezone={settings.timezone}
          locale={settings.locale}
          initialStatus={params.status ?? ''}
        />
      </Card>
    </div>
  );
}
