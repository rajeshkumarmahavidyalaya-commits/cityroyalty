'use client';
import { useState } from 'react';
import { Badge, Field, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, date, errorMessage, useResource } from '@/lib/api';
import { useStaff } from '@/components/Shell';

export default function Staff() {
  const { user } = useStaff();
  const { data, loading, reload } = useResource<{ items: { id: string; name: string; email: string; role: string; lastLoginAt: string | null }[] }>('/admin/staff');
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'content' });
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Staff & roles" sub="content: products (drafts), journal, homepage · manager: + orders, inventory, discounts, publishing · admin: everything" />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      <form className="card grid gap-3 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); try { await call('/admin/staff', { body: f }); setF({ name: '', email: '', password: '', role: 'content' }); setMsg({ t: 'ok', s: 'Staff account created.' }); await reload(); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); } }}>
        <Field label="Name" id="sn"><input id="sn" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Email" id="se"><input id="se" type="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Initial password" id="sp" hint="10+ chars, letters & numbers"><input id="sp" type="password" className="field" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="new-password" /></Field>
        <Field label="Role" id="sr"><select id="sr" className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>content</option><option>manager</option><option>admin</option></select></Field>
        <div className="self-end"><button className="btn btn-primary">Add staff</button></div>
      </form>
      {loading && !data ? <Loading /> : (
        <Table head={['Name', 'Email', 'Role', 'Last sign-in']}>{data?.items.map((s) => (<tr key={s.id}><td className="td">{s.name}</td><td className="td">{s.email}</td><td className="td">{s.id === user.id ? <Badge value={s.role} /> : <select aria-label={`Role for ${s.email}`} className="field !w-auto !min-h-8" value={s.role} onChange={async (e) => { try { await call(`/admin/staff/${s.id}`, { method: 'PATCH', body: { role: e.target.value } }); await reload(); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); } }}><option>customer</option><option>content</option><option>manager</option><option>admin</option></select>}</td><td className="td text-xs text-muted">{date(s.lastLoginAt)}</td></tr>))}</Table>
      )}
    </div>
  );
}
