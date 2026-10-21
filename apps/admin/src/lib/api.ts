'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ApiErrorBody } from '@cityroyalty/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|; )cr_csrf=([^;]+)/)?.[1] ?? '');

export async function call<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET');
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'x-csrf-token': csrf() } : {}) },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = (json as ApiErrorBody).error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Request failed', e?.details);
  }
  return json as T;
}

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await call<T>(path));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export const errorMessage = (e: unknown): string => {
  if (e instanceof ApiError) {
    const d = e.details as { path?: string; message: string }[] | { blockers?: string[] } | undefined;
    if (Array.isArray(d)) return `${e.message}: ${d.map((x) => `${x.path ? x.path + ' — ' : ''}${x.message}`).join('; ')}`;
    if (d && 'blockers' in d && d.blockers) return `${e.message}: ${d.blockers.join('; ')}`;
    return e.message;
  }
  return (e as Error)?.message ?? 'Something went wrong';
};

export const money = (paise: number | null | undefined) => (paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100));
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
