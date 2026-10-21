import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';

export const metadata: Metadata = { title: 'The Journal', description: 'Leather care, buying guides and stories from City Royalty.', alternates: { canonical: '/journal' } };

export default async function Journal() {
  const res = await api.articles();
  const items = res?.items ?? [];
  return (
    <div className="container-x py-14 md:py-24">
      <p className="eyebrow text-tan">The Journal</p>
      <h1 className="mt-3 text-5xl md:text-7xl">Notes on leather</h1>
      {items.length === 0 ? (
        <p className="mt-10 text-muted">Stories are on the way.</p>
      ) : (
        <ul className="mt-14 divide-y divide-line border-y border-line">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/journal/${a.slug}`} className="group grid gap-3 py-8 md:grid-cols-[12rem_1fr_auto] md:items-baseline md:gap-10 md:py-10">
                <p className="eyebrow text-tan">{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</p>
                <div>
                  <h2 className="text-3xl transition-colors group-hover:text-heritage md:text-4xl">{a.title}</h2>
                  {a.excerpt && <p className="mt-2 max-w-2xl text-muted">{a.excerpt}</p>}
                </div>
                <span className="eyebrow link-u hidden md:inline">Read</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
