import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashIdentifier } from '@/lib/security/hash';
import { getClientIp, type AuthSession } from '@/lib/auth/session';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/** Field names whose values must never reach the audit table. */
const REDACTED_KEYS = new Set([
  'password', 'passwordhash', 'newpassword', 'currentpassword', 'confirmpassword',
  'tokenhash', 'secret', 'apikey', 'apisecret', 'cardnumber', 'cvv', 'pin',
  'accountnumber', 'authsecret',
]);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val);
    }
    return out as unknown as T;
  }
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (value && typeof value === 'object') return value;
  return value;
}

interface AuditInput {
  session?: AuthSession | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  severity?: AuditSeverity;
}

/**
 * Writes an audit row. Auditing must never break the operation it records, so
 * failures are swallowed and logged rather than thrown.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const h = await headers();
    const ip = await getClientIp();

    await prisma.auditLog.create({
      data: {
        userId: input.session?.user.id ?? null,
        userEmail: input.session?.user.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(redact(input.before))),
        after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(redact(input.after))),
        ipHash: ip ? hashIdentifier(ip, env.AUTH_SECRET) : null,
        userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
        severity: input.severity ?? 'LOW',
      },
    });
  } catch (error) {
    console.error('[audit] failed to write audit log', error);
  }
}
