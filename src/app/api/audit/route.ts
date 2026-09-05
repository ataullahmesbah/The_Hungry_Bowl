import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, pageMeta, paginate, paginationSchema, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';

const listQuery = paginationSchema.extend({
  entity: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  userId: z.string().cuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(120).optional(),
});

/**
 * The audit trail is read-only by design — there is no PATCH or DELETE on this
 * resource anywhere in the application, so a record of who changed what cannot
 * be edited away from inside the product.
 */
export const GET = route(
  { permission: PERMISSIONS.AUDIT_VIEW, querySchema: listQuery },
  async ({ query }) => {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
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
              { action: { contains: query.search, mode: 'insensitive' } },
              { entity: { contains: query.search, mode: 'insensitive' } },
              { userEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, entities] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          before: true,
          after: true,
          severity: true,
          userEmail: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
    ]);

    return apiSuccess({
      items,
      meta: pageMeta(total, query),
      entities: entities.map((e) => ({ entity: e.entity, count: e._count })),
    });
  },
);
