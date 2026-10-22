import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductCard } from '@/components/product/ProductCard';
import { api } from '@/lib/api';

type Props = { searchParams: Promise<{ q?: string; page?: string }> };
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', page = '1' } = await searchParams;
  const term = q.trim().slice(0, 80);
  const pg = Math.max(1, Number(page) || 1);
  const res = term ? await api.search(term, pg) : null;
  return (
    <div className="container-x py-12 md:py-20">
      <p className="eyebrow text-tan">Search</p>
      <h1 className="mt-3 text-4xl md:text-6xl">{term ? <>Results for “{term}”</> : 'What are you looking for?'}</h1>
      <form action="/search" role="search" className="mt-8 flex max-w-xl border-b border-royal">
        <label htmlFor="q" className="sr-only">Search products</label>
        <input id="q" name="q" defaultValue={term} placeholder="Search jackets, bags, belts…" className="min-w-0 flex-1 bg-transparent py-3 text-lg outline-none" autoComplete="off" />
        <button className="eyebrow px-2" type="submit">Search</button>
      </form>
      {term && res && (
        <>
          <p className="mt-8 text-sm text-muted" role="status">{res.total} {res.total === 1 ? 'result' : 'results'}</p>
          {res.items.length === 0 ? (
            <div className="py-16">
              <p className="font-serif text-3xl">Nothing found</p>
              <p className="mt-2 text-muted">Check the spelling or try a broader word like “jacket”, “belt” or a colour.</p>
              <Link href="/collections/all" className="btn btn-primary mt-6">Browse everything</Link>
            </div>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {res.items.map((p, i) => (<li key={p.id}><ProductCard product={p} priority={i < 4} headingLevel={2} /></li>))}
            </ul>
          )}
          {res.pages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-6 text-sm" aria-label="Pagination">
              {pg > 1 && <Link className="link-u" href={`/search?q=${encodeURIComponent(term)}&page=${pg - 1}`}>← Previous</Link>}
              <span className="text-muted">Page {pg} of {res.pages}</span>
              {pg < res.pages && <Link className="link-u" href={`/search?q=${encodeURIComponent(term)}&page=${pg + 1}`}>Next →</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
