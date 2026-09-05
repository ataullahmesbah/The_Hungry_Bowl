import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { ReceiptSheet, type ReceiptSnapshot } from './receipt-sheet';

export const metadata = { title: 'Receipt', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string; receiptId: string }>;
}) {
  const { id, receiptId } = await params;
  await requirePagePermission(PERMISSIONS.PAYMENT_VIEW, `/dashboard/orders/${id}`);

  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });
  if (!receipt || receipt.orderId !== id) notFound();

  // The snapshot is what the customer was handed; nothing is re-derived from
  // today's menu prices.
  return (
    <ReceiptSheet
      snapshot={receipt.snapshot as unknown as ReceiptSnapshot}
      receiptNo={receipt.receiptNo}
      isReprint={receipt.isReprint}
      orderId={id}
    />
  );
}
