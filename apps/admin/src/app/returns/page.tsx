'use client';
import { useState } from 'react';
import { RETURN_STATUSES } from '@cityroyalty/shared';
import { Badge, Empty, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, date, errorMessage, useResource } from '@/lib/api';

interface Row { id: string; orderNumber: string; email: string; status: string; reason: string; lines: { title?: string; qty: number }[]; createdAt: string }
export default function Returns() {
  const { data, loading, reload } = useResource<{ items: Row[] }>('/admin/returns');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Returns & cancellations" sub="Approve or reject customer return requests. Issue the refund from the order page." />
      {msg && <div className="mb-3"><Notice tone="error">{msg}</Notice></div>}
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No return requests.</Empty> : (
        <Table head={['Order', 'Requested', 'Items', 'Reason', 'Status']}>
          {data.items.map((r) => (
            <tr key={r.id}>
              <td className="td font-medium">{r.orderNumber}<p className="text-xs font-normal text-muted">{r.email}</p></td>
              <td className="td text-xs text-muted">{date(r.createdAt)}</td>
              <td className="td text-xs">{r.lines.map((l) => `${l.title ?? 'Item'} × ${l.qty}`).join(', ')}</td>
              <td className="td max-w-xs text-xs">{r.reason}</td>
              <td className="td"><div className="flex items-center gap-2"><Badge value={r.status} /><select aria-label="Change status" className="field !min-h-8 !w-auto !text-xs" value={r.status} onChange={async (e) => { try { await call(`/admin/returns/${r.id}`, { method: 'PATCH', body: { status: e.target.value } }); await reload(); } catch (x) { setMsg(errorMessage(x)); } }}>{RETURN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
