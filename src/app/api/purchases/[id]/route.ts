import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.PURCHASE_VIEW }, async ({ params }) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { item: { select: { unit: { select: { code: true } } } } } },
      supplier: true,
      warehouse: { select: { id: true, name: true } },
      movements: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!purchase) throw new HttpError(404, 'Purchase not found', 'not_found');
  return apiSuccess(purchase);
});

/**
 * A received purchase cannot be cancelled — the stock is already in the
 * building. Returning it is a stock movement, not a deletion of the record.
 */
export const DELETE = route({ permission: PERMISSIONS.PURCHASE_MANAGE }, async ({ params, session }) => {
  const purchase = await prisma.purchase.findUnique({ where: { id: params.id } });
  if (!purchase) throw new HttpError(404, 'Purchase not found', 'not_found');

  if (purchase.status === 'RECEIVED' || purchase.status === 'PARTIALLY_RECEIVED') {
    throw new HttpError(
      409,
      'This purchase has already been received into stock. Record a return instead of cancelling it.',
      'already_received',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({ where: { id: params.id }, data: { status: 'CANCELLED' } });
    if (purchase.supplierId && Number(purchase.dueAmount) > 0) {
      await tx.supplier.update({
        where: { id: purchase.supplierId },
        data: { outstandingBalance: { decrement: purchase.dueAmount } },
      });
    }
  });

  await audit({ session, action: 'purchasing.cancelled', entity: 'Purchase', entityId: params.id, severity: 'MEDIUM', before: { purchaseNo: purchase.purchaseNo } });
  return apiSuccess({ cancelled: true });
});
