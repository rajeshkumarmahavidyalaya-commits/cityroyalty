'use client';
import { useState } from 'react';
import { Empty, Loading, PageHeader, Pager, Table } from '@/components/kit';
import { date, useResource } from '@/lib/api';

export default function Audit() {
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: { id: string; at: string; actor: string; action: string; summary: string }[] }>(`/admin/audit?page=${page}`);
  return (
    <div>
      <PageHeader title="Audit log" sub="Every administrative change, newest first." />
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>Nothing logged yet.</Empty> : (<><Table head={['When', 'Who', 'Action', 'Details']}>{data.items.map((a) => (<tr key={a.id}><td className="td whitespace-nowrap text-xs text-muted">{date(a.at)}</td><td className="td text-xs">{a.actor}</td><td className="td text-xs">{a.action}</td><td className="td text-xs">{a.summary}</td></tr>))}</Table><Pager page={page} pages={data.items.length < 50 ? page : page + 1} onPage={setPage} /></>)}
    </div>
  );
}
