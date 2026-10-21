'use client';
import type { ReactNode } from 'react';

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

const TONES: Record<string, string> = {
  draft: 'bg-stone/60 text-royal', review: 'bg-[#f1e2b8] text-[#6b4a00]', published: 'bg-[#cfe6d3] text-[#1c4a28]', archived: 'bg-line text-muted',
  paid: 'bg-[#cfe6d3] text-[#1c4a28]', processing: 'bg-[#f1e2b8] text-[#6b4a00]', shipped: 'bg-[#d2e0f2] text-[#1d3d66]', delivered: 'bg-[#cfe6d3] text-[#1c4a28]',
  pending_payment: 'bg-line text-muted', payment_failed: 'bg-[#f3cdc8] text-[#7a1b12]', cancelled: 'bg-[#f3cdc8] text-[#7a1b12]', refunded: 'bg-stone/60 text-royal',
  requested: 'bg-[#f1e2b8] text-[#6b4a00]', approved: 'bg-[#cfe6d3] text-[#1c4a28]', rejected: 'bg-[#f3cdc8] text-[#7a1b12]', received: 'bg-[#d2e0f2] text-[#1d3d66]',
};
export const Badge = ({ value }: { value: string }) => (
  <span className={`inline-block px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wider ${TONES[value] ?? 'bg-line text-royal'}`}>{value.replace(/_/g, ' ')}</span>
);

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok' | 'warn'; children: ReactNode }) {
  const c = { info: 'border-stone bg-white', error: 'border-danger/50 bg-danger/5 text-danger', ok: 'border-ok/40 bg-ok/5 text-ok', warn: 'border-warn/40 bg-warn/5 text-warn' }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`border p-3 text-sm ${c}`}>{children}</div>;
}

export const Loading = () => <div className="skeleton h-24 animate-pulse bg-line" aria-busy="true" aria-label="Loading" />;
export const Empty = ({ children }: { children: ReactNode }) => <p className="border border-dashed border-stone p-8 text-center text-sm text-muted">{children}</p>;

export function Field({ label, children, hint, id }: { label: string; children: ReactNode; hint?: string; id?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-muted">Page {page} of {pages}</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-line bg-white">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h) => (<th key={h} className="th" scope="col">{h}</th>))}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
