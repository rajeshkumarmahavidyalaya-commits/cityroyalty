'use client';
import { useState } from 'react';
import { Empty, Field, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, date, errorMessage, money, useResource } from '@/lib/api';

interface D { id: string; code: string; type: 'percent' | 'fixed' | 'free_shipping'; value: number; minSubtotal: number; maxUses: number | null; usedCount: number; startsAt?: string; endsAt?: string; active: boolean }
const blank = { code: '', type: 'percent' as D['type'], value: '10', minSubtotal: '0', maxUses: '', startsAt: '', endsAt: '', active: true };

export default function Discounts() {
  const { data, loading, reload } = useResource<{ items: D[] }>('/admin/discounts');
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      await call('/admin/discounts', { body: { code: f.code, type: f.type, value: f.type === 'percent' ? Number(f.value) : f.type === 'fixed' ? Math.round(Number(f.value) * 100) : 0, minSubtotal: Math.round(Number(f.minSubtotal || 0) * 100), maxUses: f.maxUses ? Number(f.maxUses) : null, startsAt: f.startsAt || null, endsAt: f.endsAt || null, active: f.active } });
      setF(blank); setMsg({ t: 'ok', s: 'Discount created.' }); await reload();
    } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); }
  }
  const toggle = async (d: D) => { await call(`/admin/discounts/${d.id}`, { method: 'PUT', body: { code: d.code, type: d.type, value: d.value, minSubtotal: d.minSubtotal, maxUses: d.maxUses, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, active: !d.active } }); await reload(); };
  return (
    <div className="space-y-6">
      <PageHeader title="Discount codes" />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      <form onSubmit={create} className="card grid gap-3 md:grid-cols-4">
        <Field label="Code" id="dc"><input id="dc" className="field uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></Field>
        <Field label="Type" id="dt"><select id="dt" className="field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as D['type'] })}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option><option value="free_shipping">Free shipping</option></select></Field>
        {f.type !== 'free_shipping' && <Field label={f.type === 'percent' ? 'Percent (1–90)' : 'Amount (₹)'} id="dv"><input id="dv" className="field" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></Field>}
        <Field label="Minimum subtotal (₹)" id="dm"><input id="dm" className="field" inputMode="decimal" value={f.minSubtotal} onChange={(e) => setF({ ...f, minSubtotal: e.target.value })} /></Field>
        <Field label="Max uses (blank = unlimited)" id="du"><input id="du" className="field" inputMode="numeric" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></Field>
        <Field label="Starts" id="ds"><input id="ds" type="date" className="field" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Ends" id="de"><input id="de" type="date" className="field" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <div className="self-end"><button className="btn btn-primary">Create code</button></div>
      </form>
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No discount codes.</Empty> : (
        <Table head={['Code', 'Offer', 'Minimum', 'Used', 'Window', 'Active', '']}>
          {data.items.map((d) => (
            <tr key={d.id}>
              <td className="td font-medium">{d.code}</td>
              <td className="td">{d.type === 'percent' ? `${d.value}% off` : d.type === 'fixed' ? `${money(d.value)} off` : 'Free shipping'}</td>
              <td className="td">{d.minSubtotal ? money(d.minSubtotal) : '—'}</td>
              <td className="td">{d.usedCount}{d.maxUses ? ` / ${d.maxUses}` : ''}</td>
              <td className="td text-xs text-muted">{d.startsAt ? date(d.startsAt) : 'now'} → {d.endsAt ? date(d.endsAt) : 'no end'}</td>
              <td className="td">{d.active ? 'Yes' : 'No'}</td>
              <td className="td"><button className="btn btn-ghost btn-sm" onClick={() => toggle(d)}>{d.active ? 'Disable' : 'Enable'}</button> <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Delete ${d.code}?`)) { await call(`/admin/discounts/${d.id}`, { method: 'DELETE' }); await reload(); } }}>Delete</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
