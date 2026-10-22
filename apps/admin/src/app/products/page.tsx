'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Empty, Loading, PageHeader, Pager, Table } from '@/components/kit';
import { date, money, useResource } from '@/lib/api';

interface Row { id: string; title: string; slug: string; sku: string; status: string; blockers: string[]; priceFrom: number; image: string | null; collections: string[]; updatedAt: string; variants: number; stock: number }
interface List { items: Row[]; page: number; pages: number; total: number; counts: Record<string, number> }

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get('status') ?? '';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const page = Number(sp.get('page') ?? 1);
  const url = `/admin/products?page=${page}${status ? `&status=${status}` : ''}${sp.get('q') ? `&q=${encodeURIComponent(sp.get('q')!)}` : ''}`;
  const { data, loading } = useResource<List>(url);
  const go = (p: Record<string, string>) => { const n = new URLSearchParams({ ...(status && { status }), ...(sp.get('q') && { q: sp.get('q')! }), ...p }); router.push(`/products?${n}`); };
  return (
    <div>
      <PageHeader title="Products" sub="Draft → review → published. Only products with a verified photo, a price and stock can go live." actions={<Link href="/products/new" className="btn btn-primary">New product</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['', 'draft', 'review', 'published', 'archived'].map((s) => (
          <button key={s} onClick={() => go({ status: s, page: '1' })} aria-pressed={status === s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}>{s || 'All'}{s && data ? ` (${data.counts[s] ?? 0})` : ''}</button>
        ))}
        <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); go({ q, page: '1' }); }} role="search">
          <label className="sr-only" htmlFor="q">Search products</label>
          <input id="q" className="field !w-64" placeholder="Search title or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-ghost">Search</button>
        </form>
      </div>
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No products match.</Empty> : (
        <>
          <Table head={['', 'Product', 'Status', 'Price', 'Stock', 'Blockers', 'Updated']}>
            {data.items.map((p) => (
              <tr key={p.id} className="hover:bg-ivory/60">
                <td className="td w-14">{p.image ? <img src={p.image} alt="" className="h-14 w-11 object-cover" loading="lazy" /> : <div className="h-14 w-11 bg-line" />}</td>
                <td className="td"><Link className="font-medium underline-offset-2 hover:underline" href={`/products/${p.id}`}>{p.title}</Link><p className="text-xs text-muted">{p.sku} · {p.variants} variant{p.variants === 1 ? '' : 's'}</p></td>
                <td className="td"><Badge value={p.status} /></td>
                <td className="td">{p.priceFrom ? money(p.priceFrom) : <span className="text-danger">missing</span>}</td>
                <td className="td">{p.stock}</td>
                <td className="td max-w-xs text-xs text-muted">{p.blockers.length ? p.blockers.join(' · ') : <span className="text-ok">ready</span>}</td>
                <td className="td text-xs text-muted">{date(p.updatedAt)}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pages={data.pages} onPage={(n) => go({ page: String(n) })} />
        </>
      )}
    </div>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
