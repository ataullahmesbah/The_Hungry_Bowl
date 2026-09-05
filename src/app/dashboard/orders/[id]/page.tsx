import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings, toPublicSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/primitives';
import { OrderDetail } from './order-detail';

export const metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePagePermission(PERMISSIONS.ORDER_VIEW, `/dashboard/orders/${id}`);
  const settings = await getSettings();

  const [order, methods] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { options: true }, orderBy: { createdAt: 'asc' } },
        table: { select: { id: true, name: true } },
        session: { select: { id: true, code: true, status: true } },
        customer: { select: { id: true, name: true, phone: true } },
        payments: {
          orderBy: { receivedAt: 'desc' },
          include: { method: { select: { id: true, name: true } } },
        },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
        kitchenTicket: { select: { status: true, receivedAt: true, acceptedAt: true, readyAt: true } },
        receipts: { orderBy: { issuedAt: 'desc' }, select: { id: true, receiptNo: true, issuedAt: true } },
      },
    }),
    prisma.paymentMethod.findMany({
      where: {
        isActive: true,
        OR: [{ countryCode: null }, { countryCode: settings.countryCode }],
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, kind: true, requiresReference: true, instructions: true },
    }),
  ]);

  if (!order) notFound();

  const perms = auth.user.permissions;

  return (
    <div>
      <PageHeader
        title={`Order #${order.orderNumber}`}
        description={`Code ${order.secretCode}${order.table ? ` · table ${order.table.name}` : ''}`}
        actions={
          <Link href="/dashboard/orders" className="text-sm text-espresso-500 hover:text-espresso-800">
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
            All orders
          </Link>
        }
      />
      <OrderDetail
        order={serialize(order)}
        methods={methods}
        currency={toPublicSettings(settings)}
        taxLabel={settings.taxLabel}
        timezone={settings.timezone}
        locale={settings.locale}
        can={{
          edit: perms.has(PERMISSIONS.ORDER_EDIT),
          cancel: perms.has(PERMISSIONS.ORDER_CANCEL),
          discount: perms.has(PERMISSIONS.ORDER_DISCOUNT),
          pay: perms.has(PERMISSIONS.PAYMENT_RECORD),
          refund: perms.has(PERMISSIONS.PAYMENT_REFUND),
          voidPayment: perms.has(PERMISSIONS.PAYMENT_VOID),
        }}
      />
    </div>
  );
}
