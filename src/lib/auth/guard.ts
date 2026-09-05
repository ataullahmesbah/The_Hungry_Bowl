import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, sessionHas, type AuthSession } from './session';
import type { PermissionKey } from '@/lib/rbac/permissions';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Authentication required') {
    super(401, message, 'unauthorized');
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, message, 'forbidden');
  }
}

/** For API route handlers and server actions — throws instead of redirecting. */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * Every protected API route must call this. Passing an array means "any of
 * these", which is how read-or-manage endpoints are expressed.
 */
export async function requirePermission(
  permission: PermissionKey | PermissionKey[],
): Promise<AuthSession> {
  const session = await requireSession();
  if (!sessionHas(session, permission)) throw new ForbiddenError();
  return session;
}

/** For pages and layouts — redirects a signed-out visitor to the login screen. */
export async function requirePageSession(returnTo?: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login';
    redirect(target);
  }
  return session;
}

export async function requirePagePermission(
  permission: PermissionKey | PermissionKey[],
  returnTo?: string,
): Promise<AuthSession> {
  const session = await requirePageSession(returnTo);
  if (!sessionHas(session, permission)) redirect('/dashboard/no-access');
  return session;
}

export async function can(permission: PermissionKey | PermissionKey[]): Promise<boolean> {
  return sessionHas(await getSession(), permission);
}
