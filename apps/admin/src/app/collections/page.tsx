'use client';
import { useState } from 'react';
import { Badge, Empty, Field, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, errorMessage, useResource } from '@/lib/api';

interface C { id: string; title: string; slug: string; parent: string | null; description: string; active: boolean; position: number; products: number; published: number; seo: { title?: string; description?: string } }
export default function Collections() {
  const { data, loading, reload } = useResource<{ items: C[] }>('/admin/collections');
  const [edit, setEdit] = useState<(Partial<C> & { title: string }) | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setMsg(null);
    const body = { title: edit.title, slug: edit.slug || undefined, parent: edit.parent || null, description: edit.description ?? '', active: edit.active ?? false, position: Number(edit.position ?? 0), seo: edit.seo ?? {} };
    try { await (edit.id ? call(`/admin/collections/${edit.id}`, { method: 'PUT', body }) : call('/admin/collections', { body })); setEdit(null); setMsg({ t: 'ok', s: 'Saved.' }); await reload(); }
    catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Collections" sub="A collection only appears on the storefront once it contains at least one published product." actions={<button className="btn btn-primary" onClick={() => setEdit({ title: '', active: true })}>New collection</button>} />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      {edit && (
        <form onSubmit={save} className="card grid gap-3 md:grid-cols-2">
          <Field label="Title" id="ct"><input id="ct" className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></Field>
          <Field label="Slug" id="cs" hint="Keep existing slugs to preserve legacy URLs."><input id="cs" className="field" value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
          <Field label="Parent collection" id="cp"><select id="cp" className="field" value={edit.parent ?? ''} onChange={(e) => setEdit({ ...edit, parent: e.target.value || null })}><option value="">None</option>{data?.items.filter((c) => c.id !== edit.id && !c.parent).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}</select></Field>
          <Field label="Order" id="co"><input id="co" type="number" className="field" value={edit.position ?? 0} onChange={(e) => setEdit({ ...edit, position: Number(e.target.value) })} /></Field>
          <div className="md:col-span-2"><Field label="Description" id="cd"><textarea id="cd" rows={3} className="field" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
          <Field label="SEO title" id="cst"><input id="cst" className="field" value={edit.seo?.title ?? ''} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, title: e.target.value } })} /></Field>
          <Field label="SEO description" id="csd"><input id="csd" className="field" value={edit.seo?.description ?? ''} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, description: e.target.value } })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active ?? false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2 md:col-span-2"><button className="btn btn-primary">Save</button><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No collections.</Empty> : (
        <Table head={['Collection', 'Slug', 'Products', 'Published', 'Storefront', '']}>
          {data.items.map((c) => (
            <tr key={c.id}>
              <td className="td">{c.parent && <span className="text-muted">↳ </span>}{c.title}</td>
              <td className="td text-xs text-muted">{c.slug}</td>
              <td className="td">{c.products}</td>
              <td className="td">{c.published}</td>
              <td className="td">{c.active && c.published > 0 ? <Badge value="published" /> : <span className="text-xs text-muted">{c.active ? 'Hidden — no published products' : 'Inactive'}</span>}</td>
              <td className="td"><button className="btn btn-ghost btn-sm" onClick={() => setEdit(c)}>Edit</button> <button className="btn btn-danger btn-sm" disabled={c.products > 0} title={c.products ? 'Remove its products first' : ''} onClick={async () => { if (confirm(`Delete ${c.title}?`)) { try { await call(`/admin/collections/${c.id}`, { method: 'DELETE' }); await reload(); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); } } }}>Delete</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
