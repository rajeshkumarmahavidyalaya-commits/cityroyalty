'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ORDER_STATUSES } from '@cityroyalty/shared';
import { Badge, Empty, Loading, PageHeader, Pager, Table } from '@/components/kit';
import { date, money, useResource } from '@/lib/api';

interface Row { id: string; number: string; email: string; status: string; paymentStatus: string; total: number; createdAt: string; flags: string[]; shippingAddress: { fullName: string } }
export default function Orders() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: Row[]; page: number; pages: number; total: number }>(`/admin/orders?page=${page}${status ? `&status=${status}` : ''}${term ? `&q=${encodeURIComponent(term)}` : ''}`);
  return (
    <div>
      <PageHeader title="Orders" />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="st">Status</label>
        <select id="st" className="field !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <form className="flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q); setPage(1); }}><input aria-label="Search orders" className="field !w-64" placeholder="Order no., email or name" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-ghost">Search</button></form>
      </div>
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No orders yet.</Empty> : (
        <>
          <Table head={['Order', 'Date', 'Customer', 'Status', 'Payment', 'Total']}>
            {data.items.map((o) => (
              <tr key={o.id} className="hover:bg-ivory/60">
                <td className="td"><Link className="font-medium underline-offset-2 hover:underline" href={`/orders/${o.id}`}>{o.number}</Link>{o.flags.length > 0 && <span className="ml-2 text-xs text-danger" title={o.flags.join(', ')}>⚠ needs attention</span>}</td>
                <td className="td text-xs text-muted">{date(o.createdAt)}</td>
                <td className="td">{o.shippingAddress.fullName}<p className="text-xs text-muted">{o.email}</p></td>
                <td className="td"><Badge value={o.status} /></td>
                <td className="td text-xs">{o.paymentStatus.replace('_', ' ')}</td>
                <td className="td">{money(o.total)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
