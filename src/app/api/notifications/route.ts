import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(['true', 'false']).default('false'),
});

export const GET = route({ querySchema }, async ({ session, query }) => {
  const rows = await prisma.notificationRecipient.findMany({
    where: {
      userId: session!.user.id,
      ...(query.unreadOnly === 'true' ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    select: {
      id: true,
      readAt: true,
      createdAt: true,
      notification: { select: { id: true, type: true, title: true, body: true, level: true, href: true } },
    },
  });

  const unread = await prisma.notificationRecipient.count({
    where: { userId: session!.user.id, readAt: null },
  });

  return apiSuccess({
    unread,
    items: rows.map((r) => ({
      // The recipient row id is what PATCH marks as read.
      id: r.id,
      notificationId: r.notification.id,
      type: r.notification.type,
      title: r.notification.title,
      body: r.notification.body,
      level: r.notification.level,
      href: r.notification.href,
      readAt: r.readAt,
      createdAt: r.createdAt,
    })),
  });
});

const markSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().cuid()).max(100).optional(),
});

export const PATCH = route({ bodySchema: markSchema }, async ({ session, body }) => {
  const result = await prisma.notificationRecipient.updateMany({
    where: {
      userId: session!.user.id,
      readAt: null,
      ...(body.ids?.length ? { id: { in: body.ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return apiSuccess({ marked: result.count });
});
