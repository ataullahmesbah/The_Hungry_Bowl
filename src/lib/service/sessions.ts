import 'server-only';
import { prisma } from '@/lib/db';
import { shortCode } from '@/lib/security/hash';
import { HttpError } from '@/lib/auth/guard';

/**
 * Generate a code that is unique among the sessions still in play.
 *
 * The code exists so staff can eyeball-match a ticket to a screen, not as a
 * database key — it only has to be unique among live records, so a short retry
 * loop is enough and we never need a global sequence.
 */
export async function uniqueSessionCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = shortCode(4);
    const clash = await prisma.tableSession.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  // Fall back to a longer code rather than failing to seat a table.
  return shortCode(6);
}

export async function uniqueReservationCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `R${shortCode(4)}`;
    const clash = await prisma.reservation.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `R${shortCode(6)}`;
}

/**
 * The open session for a table, if any.
 *
 * A table has at most one open session at a time — that is what makes "one
 * table, many parties, separate bills" work: the next party cannot be seated
 * until the previous session is closed, so their orders can never mix.
 */
export async function openSessionForTable(tableId: string) {
  return prisma.tableSession.findFirst({
    where: { tableId, status: 'OPEN' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      orders: {
        where: { status: { not: 'CANCELLED' } },
        select: {
          id: true,
          orderNumber: true,
          secretCode: true,
          status: true,
          paymentState: true,
          totalAmount: true,
          paidAmount: true,
          dueAmount: true,
        },
      },
    },
  });
}

export interface SessionTotals {
  orderCount: number;
  total: number;
  paid: number;
  due: number;
  hasUnpaid: boolean;
  hasOpenOrders: boolean;
}

export function summariseSession(
  orders: { status: string; totalAmount: unknown; paidAmount: unknown; dueAmount: unknown }[],
): SessionTotals {
  let total = 0;
  let paid = 0;
  let due = 0;
  let hasOpenOrders = false;

  for (const order of orders) {
    total += Number(order.totalAmount);
    paid += Number(order.paidAmount);
    due += Number(order.dueAmount);
    if (!['COMPLETED', 'CANCELLED'].includes(order.status)) hasOpenOrders = true;
  }

  return {
    orderCount: orders.length,
    total: Number(total.toFixed(2)),
    paid: Number(paid.toFixed(2)),
    due: Number(due.toFixed(2)),
    hasUnpaid: due > 0.009,
    hasOpenOrders,
  };
}

export async function assertTableAvailable(tableId: string) {
  const table = await prisma.restaurantTable.findUnique({
    where: { id: tableId },
    select: { id: true, name: true, isActive: true, deletedAt: true, status: true },
  });
  if (!table || table.deletedAt) throw new HttpError(404, 'Table not found', 'not_found');
  if (!table.isActive) throw new HttpError(409, `Table ${table.name} is not in service.`, 'table_inactive');
  if (table.status === 'MAINTENANCE') {
    throw new HttpError(409, `Table ${table.name} is marked for maintenance.`, 'table_maintenance');
  }

  const existing = await prisma.tableSession.findFirst({
    where: { tableId, status: 'OPEN' },
    select: { id: true, code: true },
  });
  if (existing) {
    throw new HttpError(
      409,
      `Table ${table.name} already has guests seated (session ${existing.code}). Close that session before seating a new party.`,
      'session_already_open',
      { sessionId: existing.id },
    );
  }

  return table;
}
