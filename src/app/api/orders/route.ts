import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { createOrderSchema } from '@/lib/validation/orders';
import { getSettings } from '@/lib/settings';
import {
  nextOrderNumber,
  optionsText,
  priceLines,
  recalculateOrder,
  uniqueOrderSecretCode,
} from '@/lib/service/orders';
import { publishEvent } from '@/lib/realtime/publish';
import { notify } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

const listQuery = paginationSchema.extend({
  status: z.string().max(60).optional(),
  sessionId: z.string().cuid().optional(),
  tableId: z.string().cuid().optional(),
  search: z.string().max(60).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GET = route(
  { permission: PERMISSIONS.ORDER_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const statuses =
      query.status === 'active'
        ? (['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const)
        : query.status
          ? (query.status.split(',').filter(Boolean) as Prisma.OrderWhereInput['status'][])
          : undefined;

    const where: Prisma.OrderWhereInput = {
      ...(statuses ? { status: { in: statuses as never } } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.tableId ? { tableId: query.tableId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { secretCode: { equals: query.search.toUpperCase() } },
              { guestName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: {
          table: { select: { id: true, name: true } },
          session: { select: { id: true, code: true } },
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return apiSuccess({ items, meta: pageMeta(total, query) });
  },
);

/**
 * Create an internal order. There is no public ordering endpoint anywhere in
 * this application — PRD scope decision.
 *
 * Prices are never taken from the request: the client sends ids and quantities,
 * and priceLines() reads the real prices from the database inside the same
 * transaction that writes the order.
 */
export const POST = route(
  { permission: PERMISSIONS.ORDER_CREATE, bodySchema: createOrderSchema },
  async ({ body, session }) => {
    const settings = await getSettings();

    let sessionId = body.sessionId ?? null;
    let tableId = body.tableId ?? null;
    let customerId = body.customerId ?? null;

    if (sessionId) {
      const tableSession = await prisma.tableSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, tableId: true, customerId: true, guestCount: true },
      });
      if (!tableSession) throw new HttpError(404, 'Table session not found', 'not_found');
      if (tableSession.status !== 'OPEN') {
        throw new HttpError(409, 'That table session is closed. Seat the party again to start a new bill.', 'session_closed');
      }
      tableId = tableSession.tableId;
      customerId = customerId ?? tableSession.customerId;
    } else if (tableId) {
      // A dine-in order without a session means nobody has been seated yet;
      // refuse rather than create an order that belongs to no bill.
      const open = await prisma.tableSession.findFirst({
        where: { tableId, status: 'OPEN' },
        select: { id: true },
      });
      if (!open) {
        throw new HttpError(
          409,
          'Nobody is seated at that table yet. Seat the guests first so their orders go on one bill.',
          'no_open_session',
        );
      }
      sessionId = open.id;
    }

    const order = await prisma.$transaction(async (tx) => {
      const priced = await priceLines(tx, body.lines);
      const orderNumber = await nextOrderNumber(tx, settings);
      const secretCode = await uniqueOrderSecretCode(tx);
      const now = new Date();

      const created = await tx.order.create({
        data: {
          orderNumber,
          secretCode,
          sessionId,
          tableId,
          customerId,
          type: body.type,
          status: body.sendToKitchen ? 'PLACED' : 'DRAFT',
          guestName: body.guestName?.trim() || null,
          guestPhone: body.guestPhone?.trim() || null,
          guestCount: body.guestCount,
          note: body.note?.trim() || null,
          taxPercent: settings.taxPercent,
          serviceChargePercent: settings.serviceChargePercent,
          createdById: session!.user.id,
          waiterId: session!.user.id,
          placedAt: body.sendToKitchen ? now : null,
          items: {
            create: priced.map((line) => ({
              menuItemId: line.menuItemId,
              variantId: line.variantId,
              itemName: line.itemName,
              variantName: line.variantName,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              addOnTotal: line.addOnTotal,
              lineTotal: line.lineTotal,
              note: line.note,
              status: body.sendToKitchen ? 'PLACED' : 'DRAFT',
              options: {
                create: line.options.map((option) => ({
                  addOnId: option.addOnId,
                  groupName: option.groupName,
                  addOnName: option.addOnName,
                  price: option.price,
                })),
              },
            })),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: body.sendToKitchen ? 'PLACED' : 'DRAFT',
              changedById: session!.user.id,
            },
          },
        },
        include: { items: { include: { options: true } } },
      });

      if (body.sendToKitchen) {
        await tx.kitchenTicket.create({
          data: {
            orderId: created.id,
            status: 'NEW',
            items: {
              create: created.items.map((item) => ({
                orderItemId: item.id,
                itemName: item.itemName,
                variantName: item.variantName,
                quantity: item.quantity,
                optionsText: optionsText(item.options, item.note),
                note: item.note,
              })),
            },
          },
        });
      }

      await recalculateOrder(tx, created.id);

      return tx.order.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          items: { include: { options: true } },
          table: { select: { id: true, name: true } },
        },
      });
    });

    if (body.sendToKitchen) {
      await publishEvent({
        channel: 'kitchen',
        type: 'order.placed',
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          secretCode: order.secretCode,
          tableName: order.table?.name ?? null,
          itemCount: order.items.length,
        },
        requiredPermission: PERMISSIONS.KITCHEN_VIEW,
      });

      await notify({
        type: 'order.placed',
        title: `New order #${order.orderNumber} · ${order.secretCode}`,
        body: `${order.items.length} item(s)${order.table ? ` for table ${order.table.name}` : ''}.`,
        level: 'INFO',
        href: '/dashboard/kitchen',
        permissions: [PERMISSIONS.KITCHEN_VIEW],
        excludeUserId: session!.user.id,
      });
    }

    await audit({
      session,
      action: 'order.created',
      entity: 'Order',
      entityId: order.id,
      after: { orderNumber: order.orderNumber, total: Number(order.totalAmount), items: order.items.length },
    });

    return apiSuccess(order, { status: 201 });
  },
);
