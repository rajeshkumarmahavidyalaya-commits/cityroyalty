'use client';
import { useState } from 'react';
import { useStaff } from '@/components/Shell';
import { Empty, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, date, errorMessage, money, useResource } from '@/lib/api';

interface Row { id: string; name: string; email: string; phone: string | null; createdAt: string; orders: number; spent: number; deletionRequestedAt: string | null }
export default function Customers() {
  const { user } = useStaff();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const { data, loading, reload } = useResource<{ items: Row[] }>(`/admin/customers${term ? `?q=${encodeURIComponent(term)}` : ''}`);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Customers" actions={<form className="flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q); }}><input aria-label="Search customers" className="field !w-64" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-ghost">Search</button></form>} />
      {msg && <div className="mb-3"><Notice tone="error">{msg}</Notice></div>}
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No customer accounts yet. Guest orders appear under Orders.</Empty> : (
        <Table head={['Customer', 'Joined', 'Orders', 'Spent', 'Privacy']}>
          {data.items.map((c) => (
            <tr key={c.id}>
              <td className="td">{c.name}<p className="text-xs text-muted">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p></td>
              <td className="td text-xs text-muted">{date(c.createdAt)}</td>
              <td className="td">{c.orders}</td>
              <td className="td">{money(c.spent)}</td>
              <td className="td text-xs">{c.deletionRequestedAt ? (
                <span className="text-danger">Deletion requested {date(c.deletionRequestedAt)}{user.role === 'admin' && <button className="btn btn-danger btn-sm ml-2" onClick={async () => { if (confirm(`Erase personal data for ${c.email}? Orders are kept. This cannot be undone.`)) { try { await call(`/admin/customers/${c.id}/anonymize`, { body: {} }); await reload(); } catch (e) { setMsg(errorMessage(e)); } } }}>Erase data</button>}</span>
              ) : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
