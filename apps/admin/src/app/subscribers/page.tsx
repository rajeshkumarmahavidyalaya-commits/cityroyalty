'use client';
import { Empty, Loading, PageHeader, Table } from '@/components/kit';
import { call, date, useResource } from '@/lib/api';

export default function Subscribers() {
  const { data, loading, reload } = useResource<{ items: { id: string; email: string; source: string | null; createdAt: string }[]; total: number }>('/admin/subscribers');
  return (
    <div>
      <PageHeader title="Newsletter subscribers" sub={data ? `${data.total} subscribers` : undefined} actions={<a className="btn btn-ghost" href="/api/v1/admin/subscribers?format=csv">Export CSV</a>} />
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No subscribers yet.</Empty> : (
        <Table head={['Email', 'Source', 'Joined', '']}>{data.items.map((s) => (<tr key={s.id}><td className="td">{s.email}</td><td className="td text-xs text-muted">{s.source ?? '—'}</td><td className="td text-xs text-muted">{date(s.createdAt)}</td><td className="td"><button className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Remove ${s.email}?`)) { await call(`/admin/subscribers/${s.id}`, { method: 'DELETE' }); await reload(); } }}>Remove</button></td></tr>))}</Table>
      )}
    </div>
  );
}
