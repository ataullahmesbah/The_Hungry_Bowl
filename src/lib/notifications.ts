import 'server-only';
import { prisma } from '@/lib/db';
import type { NotificationLevel } from '@prisma/client';

interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  level?: NotificationLevel;
  href?: string;
  data?: Record<string, unknown>;
  /** Only users holding one of these permissions are notified. */
  permissions: string[];
  /** Do not notify the person who caused the event. */
  excludeUserId?: string | null;
}

/**
 * Fan out a notification to every active user who holds one of the given
 * permissions. Delivery is permission-based rather than role-based so a
 * custom role created by the owner still receives the right alerts, and
 * kitchen staff never see finance-only messages.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(input.excludeUserId ? { NOT: { id: input.excludeUserId } } : {}),
        roles: {
          some: {
            role: { permissions: { some: { permission: { key: { in: input.permissions } } } } },
          },
        },
      },
      select: { id: true },
    });

    if (users.length === 0) return;

    await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        level: input.level ?? 'INFO',
        href: input.href ?? null,
        data: input.data ? JSON.parse(JSON.stringify(input.data)) : undefined,
        recipients: { create: users.map((u) => ({ userId: u.id })) },
      },
    });
  } catch (error) {
    console.error('[notify] failed', error);
  }
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notificationRecipient.count({ where: { userId, readAt: null } });
}
