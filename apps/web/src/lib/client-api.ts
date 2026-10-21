'use client';
import type { ApiErrorBody } from '@cityroyalty/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|; )cr_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

/** Browser → API through the same-origin /api rewrite (cookies + CSRF header handled here). */
export async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as T & Partial<ApiErrorBody>) : ({} as T);
  if (!res.ok) {
    const e = (json as ApiErrorBody).error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Something went wrong', e?.details);
  }
  return json;
}

export const fieldErrors = (e: unknown): Record<string, string> => {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: string; message: string }[]) if (d.path) out[d.path] = d.message;
  return out;
};
