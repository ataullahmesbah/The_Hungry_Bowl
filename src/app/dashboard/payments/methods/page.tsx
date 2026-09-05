import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { MethodsManager } from './methods-manager';

export const metadata = { title: 'Payment methods' };
export const dynamic = 'force-dynamic';

export default async function PaymentMethodsPage() {
  await requirePagePermission(PERMISSIONS.PAYMENT_METHOD_MANAGE, '/dashboard/payments/methods');
  const settings = await getSettings();

  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { payments: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Payment methods"
        description="What staff can choose when recording a payment."
      />
      <div className="mb-5">
        <Alert tone="info" title={`Configured for ${settings.countryName}`}>
          Methods tagged with another country are hidden from the payment screen. If you open in a different country,
          switch the country in Settings and turn off the methods you do not use — no code change is needed.
        </Alert>
      </div>
      <MethodsManager
        methods={methods.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          kind: m.kind,
          isActive: m.isActive,
          requiresReference: m.requiresReference,
          countryCode: m.countryCode,
          instructions: m.instructions,
          sortOrder: m.sortOrder,
          paymentCount: m._count.payments,
        }))}
        restaurantCountry={settings.countryCode}
      />
    </div>
  );
}
