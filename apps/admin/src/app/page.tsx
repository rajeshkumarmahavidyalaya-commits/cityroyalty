'use client';
import Link from 'next/link';
import { useStaff } from '@/components/Shell';
import { Loading, Notice, PageHeader, Table } from '@/components/kit';
import { date, money, useResource } from '@/lib/api';
import { useState } from 'react';

interface Summary {
  days: number; revenue: number; orders: number; discounts: number; aov: number;
  byDay: { date: string; revenue: number; orders: number }[];
  topProducts: { title: string; units: number; revenue: number }[];
  byStatus: Record<string, number>;
  lowStockProducts: number; productsWithUnknownStock: number;
}
interface ProductList { counts: Record<string, number> }

export default function Dashboard() {
  const { user } = useStaff();
  const mgr = user.role !== 'content';
  const [days, setDays] = useState(30);
  const sum = useResource<Summary>(mgr ? `/admin/reports/summary?days=${days}` : null);
  const prods = useResource<ProductList>('/admin/products?page=1');
  const c = prods.data?.counts ?? {};
  const max = Math.max(1, ...(sum.data?.byDay.map((d) => d.revenue) ?? [1]));
  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" sub={`Welcome, ${user.name}.`} actions={mgr && (
        <select aria-label="Period" className="field !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
      )} />
      <section aria-label="Catalogue status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['draft', 'review', 'published', 'archived'] as const).map((s) => (
          <Link key={s} href={`/products?status=${s}`} className="card hover:border-royal"><p className="text-xs uppercase tracking-wider text-muted">{s}</p><p className="mt-1 font-serif text-4xl">{c[s] ?? 0}</p><p className="text-xs text-muted">products</p></Link>
        ))}
      </section>
      {mgr && (sum.loading && !sum.data ? <Loading /> : sum.data && (
        <>
          {(sum.data.productsWithUnknownStock > 0 || sum.data.lowStockProducts > 0) && (
            <Notice tone="warn">
              {sum.data.productsWithUnknownStock > 0 && <><b>{sum.data.productsWithUnknownStock}</b> products have variants with no stock entered. </>}
              {sum.data.lowStockProducts > 0 && <><b>{sum.data.lowStockProducts}</b> live products are low on stock. </>}
              <Link className="underline" href="/inventory">Open inventory</Link>
            </Notice>
          )}
          <section aria-label="Sales" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card"><p className="text-xs uppercase tracking-wider text-muted">Revenue</p><p className="mt-1 font-serif text-3xl">{money(sum.data.revenue)}</p></div>
            <div className="card"><p className="text-xs uppercase tracking-wider text-muted">Orders</p><p className="mt-1 font-serif text-3xl">{sum.data.orders}</p></div>
            <div className="card"><p className="text-xs uppercase tracking-wider text-muted">Average order</p><p className="mt-1 font-serif text-3xl">{money(sum.data.aov)}</p></div>
            <div className="card"><p className="text-xs uppercase tracking-wider text-muted">Discounts given</p><p className="mt-1 font-serif text-3xl">{money(sum.data.discounts)}</p></div>
          </section>
          <section className="card" aria-label="Revenue by day">
            <h2 className="mb-4 text-xl">Revenue by day</h2>
            {sum.data.byDay.length === 0 ? <p className="text-sm text-muted">No paid orders in this period.</p> : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label={`Daily revenue, ${sum.data.byDay.length} days with orders`}>
                {sum.data.byDay.map((d) => (<div key={d.date} title={`${d.date}: ${money(d.revenue)} (${d.orders} orders)`} className="flex-1 bg-heritage" style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }} />))}
              </div>
            )}
          </section>
          <section aria-label="Top products">
            <h2 className="mb-3 text-xl">Best sellers (by units)</h2>
            {sum.data.topProducts.length === 0 ? <p className="text-sm text-muted">Nothing sold yet — this list is computed from real orders only.</p> : (
              <Table head={['Product', 'Units', 'Revenue']}>{sum.data.topProducts.map((p) => (<tr key={p.title}><td className="td">{p.title}</td><td className="td">{p.units}</td><td className="td">{money(p.revenue)}</td></tr>))}</Table>
            )}
          </section>
          <p className="text-xs text-muted">Generated {date(new Date().toISOString())}</p>
        </>
      ))}
    </div>
  );
}
