import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { paymentMethodSchema } from '@/lib/validation/orders';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';

/**
 * Methods are rows, not an enum.
 *
 * A restaurant in Bangladesh keeps bKash, Nagad and Rocket switched on; a
 * client abroad switches them off and adds their own, all from the dashboard.
 * Methods tagged with a country other than the restaurant's are hidden by
 * default so the payment screen stays short.
 */
export const GET = route({ permission: PERMISSIONS.PAYMENT_VIEW }, async ({ req }) => {
  const settings = await getSettings();
  const includeAll = req.nextUrl.searchParams.get('all') === 'true';

  const methods = await prisma.paymentMethod.findMany({
    where: includeAll
      ? {}
      : {
          isActive: true,
          OR: [{ countryCode: null }, { countryCode: settings.countryCode }],
        },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return apiSuccess(methods);
});

export const POST = route(
  { permission: PERMISSIONS.PAYMENT_METHOD_MANAGE, bodySchema: paymentMethodSchema },
  async ({ body, session }) => {
    const method = await prisma.paymentMethod.create({ data: body });
    await audit({ session, action: 'payment_method.created', entity: 'PaymentMethod', entityId: method.id, after: body, severity: 'MEDIUM' });
    return apiSuccess(method, { status: 201 });
  },
);
