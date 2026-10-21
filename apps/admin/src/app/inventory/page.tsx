'use client';
import { useMemo, useState } from 'react';
import { Badge, Empty, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, errorMessage, useResource } from '@/lib/api';

interface Row { productId: string; variantId: string; title: string; status: string; sku: string; active: boolean; options: Record<string, string>; stock: number | null; madeToOrder: boolean }
export default function Inventory() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unknown' | 'low' | 'out'>('all');
  const { data, loading, reload } = useResource<{ items: Row[] }>(`/admin/inventory${term ? `?q=${encodeURIComponent(term)}` : ''}`);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const rows = useMemo(() => (data?.items ?? []).filter((r) => r.active && (filter === 'all' || (filter === 'unknown' && r.stock == null && !r.madeToOrder) || (filter === 'low' && r.stock != null && r.stock > 0 && r.stock <= 3) || (filter === 'out' && r.stock === 0))), [data, filter]);
  async function save(r: Row) {
    const raw = edits[r.variantId];
    if (raw === undefined) return;
    try {
      await call('/admin/inventory/adjust', { body: { variantId: r.variantId, stock: raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0), reason: 'Manual adjustment in admin' } });
      setEdits(({ [r.variantId]: _, ...rest }) => rest);
      setMsg({ t: 'ok', s: `Updated ${r.sku}` });
      await reload();
    } catch (e) { setMsg({ t: 'error', s: errorMessage(e) }); }
  }
  return (
    <div>
      <PageHeader title="Inventory" sub="Stock is the single source for availability. Blank means unknown (cannot be sold). Every change is logged." />
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.s}</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'unknown', 'low', 'out'] as const).map((f) => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{{ all: 'All', unknown: 'Stock unknown', low: 'Low (≤3)', out: 'Out of stock' }[f]}</button>)}
        <form className="ml-auto flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q); }}><input aria-label="Search inventory" className="field !w-64" placeholder="Title or SKU" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-ghost">Search</button></form>
      </div>
      {loading && !data ? <Loading /> : !rows.length ? <Empty>No variants match.</Empty> : (
        <Table head={['Product', 'Variant', 'SKU', 'Status', 'Stock', '']}>
          {rows.map((r) => (
            <tr key={r.variantId}>
              <td className="td">{r.title}</td>
              <td className="td text-xs">{Object.values(r.options).join(' · ') || '—'}{r.madeToOrder && <span className="ml-1 text-tan">(made to order)</span>}</td>
              <td className="td text-xs text-muted">{r.sku}</td>
              <td className="td"><Badge value={r.status} /></td>
              <td className="td"><input aria-label={`Stock for ${r.sku}`} inputMode="numeric" className="field !w-24" placeholder="unknown" value={edits[r.variantId] ?? (r.stock ?? '')} onChange={(e) => setEdits({ ...edits, [r.variantId]: e.target.value })} /></td>
              <td className="td"><button className="btn btn-primary btn-sm" disabled={edits[r.variantId] === undefined} onClick={() => save(r)}>Save</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
