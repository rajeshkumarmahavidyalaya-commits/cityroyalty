'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Paged, ProductCardDTO } from '@cityroyalty/shared';
import { call } from '@/lib/client-api';
import { formatMoney } from '@/lib/format';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { SearchIcon } from '../ui/Icons';

export function SearchPanel({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProductCardDTO[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setState('idle');
      return;
    }
    setState('loading');
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await call<Paged<ProductCardDTO>>(`/search?q=${encodeURIComponent(term)}&limit=6`);
        if (!ctl.signal.aborted) {
          setItems(r.items);
          setState('done');
        }
      } catch {
        if (!ctl.signal.aborted) setState('done');
      }
    }, 250);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="container-x pb-10 pt-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onNavigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        className="flex items-center gap-3 border-b border-royal py-3"
      >
        <SearchIcon />
        <input
          data-autofocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search jackets, bags, belts…"
          aria-label="Search products"
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl outline-none placeholder:text-muted/60 md:text-4xl"
          autoComplete="off"
        />
      </form>
      <div aria-live="polite" className="min-h-24 pt-6">
        {state === 'done' && items.length === 0 && <p className="text-muted">No products found for “{q}”. Try a colour or a product type.</p>}
        {items.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-6">
              {items.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.slug}`} onClick={() => onNavigate(`/products/${p.slug}`)} className="group block">
                    {p.image ? <ResponsiveImage image={p.image} sizes="(min-width:768px) 16vw, 45vw" ratio="4 / 5" /> : <div className="aspect-[4/5] bg-line" />}
                    <p className="mt-2 line-clamp-2 text-sm">{p.title}</p>
                    <p className="text-sm text-muted">{p.priceFrom ? formatMoney(p.priceFrom) : ''}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className="eyebrow link-u mt-6" onClick={() => onNavigate(`/search?q=${encodeURIComponent(q.trim())}`)}>
              View all results
            </button>
          </>
        )}
      </div>
    </div>
  );
}
