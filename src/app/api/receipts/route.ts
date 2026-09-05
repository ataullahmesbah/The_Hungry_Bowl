import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getSettings } from '@/lib/settings';
import { businessDateKey } from '@/lib/service/orders';
import { maskReference } from '@/lib/format';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const bodySchema = z.object({ orderId: z.string().cuid() });

/**
 * Issue a receipt.
 *
 * The bill is frozen into a JSON snapshot at issue time, so a reprint months
 * later shows exactly what the customer was given — not what the menu prices
 * happen to be today.
 */
export const POST = route(
  { permission: PERMISSIONS.PAYMENT_VIEW, bodySchema },
  async ({ body, session }) => {
    const settings = await getSettings();

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      include: {
        items: { include: { options: true }, orderBy: { createdAt: 'asc' } },
        payments: {
          where: { status: { in: ['COMPLETED', 'REFUNDED'] } },
          include: { method: { select: { name: true } } },
        },
        table: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        session: { select: { code: true } },
      },
    });

    if (!order) throw new HttpError(404, 'Order not found', 'not_found');

    const existing = await prisma.receipt.count({ where: { orderId: order.id } });

    const snapshot = {
      restaurant: {
        name: settings.name,
        address: [settings.addressLine1, settings.addressLine2, settings.city, settings.postalCode]
          .filter(Boolean)
          .join(', '),
        phone: settings.phone,
        email: settings.email,
        taxRegNumber: settings.taxRegNumber,
        currencySymbol: settings.currencySymbol,
        currencyCode: settings.currencyCode,
        currencyPosition: settings.currencyPosition,
        currencyDecimals: settings.currencyDecimals,
        locale: settings.locale,
        timezone: settings.timezone,
      },
      order: {
        orderNumber: order.orderNumber,
        secretCode: order.secretCode,
        sessionCode: order.session?.code ?? null,
        table: order.table?.name ?? null,
        type: order.type,
        guestName: order.customer?.name ?? order.guestName,
        guestCount: order.guestCount,
        createdAt: order.createdAt.toISOString(),
        completedAt: order.completedAt?.toISOString() ?? null,
        note: order.note,
      },
      items: order.items
        .filter((item) => item.quantity - item.cancelledQty > 0)
        .map((item) => ({
          name: item.itemName,
          variant: item.variantName,
          quantity: item.quantity - item.cancelledQty,
          unitPrice: Number(item.unitPrice),
          addOns: item.options.map((option) => ({ name: option.addOnName, price: Number(option.price) })),
          lineTotal: Number(item.lineTotal),
          note: item.note,
        })),
      totals: {
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        discountReason: order.discountReason,
        serviceChargePercent: Number(order.serviceChargePercent),
        serviceChargeAmount: Number(order.serviceChargeAmount),
        taxLabel: settings.taxLabel,
        taxPercent: Number(order.taxPercent),
        taxAmount: Number(order.taxAmount),
        totalAmount: Number(order.totalAmount),
        paidAmount: Number(order.paidAmount),
        dueAmount: Number(order.dueAmount),
      },
      payments: order.payments.map((payment) => ({
        method: payment.method.name,
        amount: Number(payment.amount),
        // Only the masked tail is ever printed.
        reference: maskReference(payment.reference),
        maskedAccount: payment.maskedAccount ? `••••${payment.maskedAccount.slice(-4)}` : null,
        receivedAt: payment.receivedAt.toISOString(),
        refunded: Number(payment.refundedAmount),
      })),
      issuedBy: session!.user.name,
      issuedAt: new Date().toISOString(),
    };

    const receipt = await prisma.receipt.create({
      data: {
        orderId: order.id,
        receiptNo: `R-${businessDateKey(settings.timezone).replace(/-/g, '')}-${order.orderNumber}${existing > 0 ? `-${existing + 1}` : ''}`,
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        issuedById: session!.user.id,
        isReprint: existing > 0,
      },
    });

    await audit({
      session,
      action: existing > 0 ? 'receipt.reprinted' : 'receipt.issued',
      entity: 'Receipt',
      entityId: receipt.id,
      after: { receiptNo: receipt.receiptNo, orderNumber: order.orderNumber },
    });

    return apiSuccess(receipt, { status: 201 });
  },
);
