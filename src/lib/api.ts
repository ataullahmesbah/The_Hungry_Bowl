import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { ForbiddenError, HttpError, UnauthorizedError, requirePermission, requireSession } from '@/lib/auth/guard';
import { getClientIp, type AuthSession } from '@/lib/auth/session';
import { RATE_LIMITS, rateLimit } from '@/lib/security/rate-limit';
import { serialize, type Serialized } from '@/lib/db';
import type { PermissionKey } from '@/lib/rbac/permissions';

export interface ApiContext<TBody = unknown, TQuery = unknown> {
  req: NextRequest;
  session: AuthSession | null;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  ip: string | null;
}

interface RouteOptions<TBody, TQuery> {
  /** Omit for a deliberately public endpoint; every other route must name one. */
  permission?: PermissionKey | PermissionKey[];
  /** Set true only for endpoints the anonymous public website needs. */
  public?: boolean;
  // ZodType with a loose Input parameter so schemas that use `.default()` or
  // `.coerce` infer their *output* type here, not the raw request shape.
  bodySchema?: z.ZodType<TBody, z.ZodTypeDef, unknown>;
  querySchema?: z.ZodType<TQuery, z.ZodTypeDef, unknown>;
  rateLimit?: { bucket: string; limit: number; windowSeconds: number };
  /** Mutating verbs get an Origin check; disable only for webhooks. */
  csrf?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Success envelope.
 *
 * `data` is run through serialize() first, so a Prisma Decimal leaves as the
 * number the client types promise. Without it NextResponse.json calls
 * Decimal.toJSON(), which yields a STRING — and every price the browser did
 * arithmetic on would silently be text.
 */
export function apiSuccess<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(
    { ok: true, data: serialize(data) as Serialized<T> },
    {
      status: init?.status ?? 200,
      headers: {
        // Authenticated payloads must never be cached by a CDN or a browser.
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        ...(init?.headers ?? {}),
      },
    },
  );
}

/**
 * Reject a cross-site form post. The session cookie is SameSite=Lax, which
 * already blocks cross-site POSTs in modern browsers; this is the second lock.
 */
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches and server-to-server calls omit it
  const allowed = new Set([env.APP_URL, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean) as string[]);
  const host = req.headers.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

type Handler<TBody, TQuery> = (ctx: ApiContext<TBody, TQuery>) => Promise<NextResponse> | NextResponse;

/**
 * Wraps every API route with the same guarantees: origin check, rate limit,
 * authentication, permission check, schema validation and uniform errors.
 *
 * A handler is unreachable without a permission unless it explicitly opts into
 * `public: true`, so forgetting the check cannot silently expose data.
 */
export function route<TBody = unknown, TQuery = unknown>(
  options: RouteOptions<TBody, TQuery>,
  handler: Handler<TBody, TQuery>,
) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const isMutation = !SAFE_METHODS.has(req.method);

      if (isMutation && options.csrf !== false && !originAllowed(req)) {
        return jsonError(403, 'bad_origin', 'Request origin is not allowed');
      }

      const ip = await getClientIp();

      const limitConfig =
        options.rateLimit ??
        (isMutation
          ? { bucket: 'mutation', ...RATE_LIMITS.mutation }
          : { bucket: 'read', ...RATE_LIMITS.read });

      const limited = await rateLimit(
        limitConfig.bucket,
        ip ?? 'unknown',
        limitConfig.limit,
        limitConfig.windowSeconds,
      );
      if (!limited.ok) {
        return NextResponse.json(
          { ok: false, error: { code: 'rate_limited', message: 'Too many requests. Please slow down.' } },
          { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds), 'Cache-Control': 'no-store' } },
        );
      }

      let session: AuthSession | null = null;
      if (options.permission) {
        session = await requirePermission(options.permission);
      } else if (!options.public) {
        session = await requireSession();
      }

      let body = undefined as TBody;
      if (options.bodySchema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return jsonError(400, 'invalid_json', 'Request body must be valid JSON');
        }
        const parsed = options.bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonError(422, 'validation_failed', 'Some fields are invalid', flattenZod(parsed.error));
        }
        body = parsed.data;
      }

      let query = undefined as TQuery;
      if (options.querySchema) {
        const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        const parsed = options.querySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonError(422, 'validation_failed', 'Some filters are invalid', flattenZod(parsed.error));
        }
        query = parsed.data;
      }

      const params = context?.params ? await context.params : {};

      return await handler({ req, session, body, query, params, ip });
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export function flattenZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) return jsonError(401, error.code, error.message);
  if (error instanceof ForbiddenError) return jsonError(403, error.code, error.message);
  if (error instanceof HttpError) return jsonError(error.status, error.code, error.message, error.details);
  if (error instanceof z.ZodError) {
    return jsonError(422, 'validation_failed', 'Some fields are invalid', flattenZod(error));
  }

  // Prisma unique-constraint and foreign-key failures, surfaced without leaking
  // table names or SQL to the client.
  const code = (error as { code?: string })?.code;
  if (code === 'P2002') return jsonError(409, 'duplicate', 'A record with these details already exists');
  if (code === 'P2025') return jsonError(404, 'not_found', 'The requested record was not found');
  if (code === 'P2003') return jsonError(409, 'in_use', 'This record is referenced elsewhere and cannot be changed');

  console.error('[api] unhandled error', error);
  return jsonError(500, 'server_error', 'Something went wrong. Please try again.');
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(input: { page: number; pageSize: number }) {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}

export function pageMeta(total: number, input: { page: number; pageSize: number }) {
  return {
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
