'use client';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper used by every dashboard form. It never swallows an error:
 * a failed request throws an ApiError carrying the field-level details the
 * server produced, so forms can highlight the exact input that failed.
 */
export async function apiFetch<T = unknown>(
  input: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;

  const response = await fetch(input, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const body = payload as { ok?: boolean; data?: T; error?: ApiErrorShape } | null;

  if (!response.ok || body?.ok === false) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }

  return (body?.data ?? (null as T)) as T;
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'POST', json }),
  patch: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'PATCH', json }),
  put: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'PUT', json }),
  del: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'DELETE', json }),
};
