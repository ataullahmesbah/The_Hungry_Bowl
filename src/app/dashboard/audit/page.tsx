import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { serialize } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader, Alert } from '@/components/ui/primitives';
import { AuditTable } from './audit-table';

export const metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requirePagePermission(PERMISSIONS.AUDIT_VIEW, '/dashboard/audit');
  const settings = await getSettings();

  const [entries, entities] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
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
    prisma.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Money, stock and permission changes are always recorded."
      />
      <div className="mb-5">
        <Alert tone="info" title="This record cannot be edited">
          There is no way to change or delete an audit entry from inside the system — not for an owner, not for a
          super admin. Sensitive values such as passwords and card references are redacted before they are written.
        </Alert>
      </div>
      <AuditTable
        entries={serialize(entries)}
        entities={entities.map((e) => ({ entity: e.entity, count: e._count }))}
        timezone={settings.timezone}
        locale={settings.locale}
      />
    </div>
  );
}
