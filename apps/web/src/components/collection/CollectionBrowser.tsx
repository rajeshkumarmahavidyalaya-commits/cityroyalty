'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { FacetsDTO, Paged, ProductCardDTO } from '@cityroyalty/shared';
import { SORT_OPTIONS } from '@cityroyalty/shared';
import { call } from '@/lib/client-api';
import { formatMoney, prettySize, sizeRank, swatchColour } from '@/lib/format';
import { Drawer } from '../ui/Drawer';
import { FilterIcon, GridIcon, ListIcon } from '../ui/Icons';
import { ProductCard } from '../product/ProductCard';

const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  featured: 'Featured', newest: 'Newest', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low', title: 'Name A–Z',
};

type Params = Record<string, string>;

export function CollectionBrowser({ initial, facets, params, apiQuery }: { initial: Paged<ProductCardDTO>; facets: FacetsDTO; params: Params; apiQuery: string }) {
  const router = useRouter();
  const path = usePathname();
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [drawer, setDrawer] = useState(false);

  const push = useCallback(
    (next: Params) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
      router.push(`${path}${q.size ? `?${q}` : ''}`, { scroll: false });
    },
    [router, path],
  );
  const set = (k: string, v: string) => push({ ...params, [k]: v });
  const toggleIn = (k: string, v: string) => {
    const cur = (params[k] ?? '').split(',').filter(Boolean);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    push({ ...params, [k]: next.join(',') });
  };
  const active = ['size', 'colour', 'material', 'minPrice', 'maxPrice', 'inStock'].filter((k) => params[k]).length;

  async function more() {
    setLoading(true);
    try {
      const r = await call<Paged<ProductCardDTO>>(`/products?${apiQuery}&page=${page + 1}`);
      setItems((x) => [...x, ...r.items.filter((n) => !x.some((o) => o.id === n.id))]);
      setPage(r.page);
    } finally {
      setLoading(false);
    }
  }

  const filters = useMemo(
    () => (
      <FilterPanel facets={facets} params={params} toggleIn={toggleIn} set={set} setMany={(u) => push({ ...params, ...u })} clear={() => push({ sort: params.sort ?? '', q: params.q ?? '' })} />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facets, params],
  );

  return (
    <div className="container-x pb-24">
      <div className="sticky top-16 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-ivory/95 px-4 py-3 backdrop-blur md:top-20 md:mx-0 md:px-0">
        <div className="flex items-center gap-4">
          <button type="button" className="eyebrow inline-flex items-center gap-2 lg:hidden" onClick={() => setDrawer(true)} aria-haspopup="dialog">
            <FilterIcon width={18} height={18} /> Filters{active ? ` (${active})` : ''}
          </button>
          <p className="text-sm text-muted" role="status">{initial.total} {initial.total === 1 ? 'piece' : 'pieces'}</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only text-muted">Sort</span>
            <select className="cursor-pointer bg-transparent py-1 pr-1 text-sm outline-none" value={params.sort ?? 'featured'} onChange={(e) => set('sort', e.target.value === 'featured' ? '' : e.target.value)}>
              {SORT_OPTIONS.map((s) => (<option key={s} value={s}>{SORT_LABEL[s]}</option>))}
            </select>
          </label>
          <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')} className={`p-1.5 ${view === 'grid' ? 'text-royal' : 'text-muted'}`}><GridIcon width={20} height={20} /></button>
            <button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'text-royal' : 'text-muted'}`}><ListIcon width={20} height={20} /></button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-12 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{filters}</aside>
        <div>
          {items.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-serif text-3xl">Nothing matches those filters</p>
              <button type="button" className="btn btn-ghost mt-6" onClick={() => push({})}>Clear filters</button>
            </div>
          ) : (
            <ul className={view === 'grid' ? 'grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 xl:grid-cols-3' : 'space-y-8'}>
              {items.map((p, i) => (
                <li key={p.id}><ProductCard product={p} priority={i < 4} layout={view} /></li>
              ))}
            </ul>
          )}
          {page < initial.pages && (
            <div className="mt-14 text-center">
              <p className="mb-4 text-xs text-muted">Showing {items.length} of {initial.total}</p>
              <button type="button" className="btn btn-ghost" onClick={more} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </div>
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters" side="left" width="min(24rem,100vw)">
        <div className="flex-1 overflow-y-auto px-5 py-4">{filters}</div>
        <div className="border-t border-line p-4"><button type="button" className="btn btn-primary w-full" onClick={() => setDrawer(false)}>Show {initial.total} {initial.total === 1 ? 'piece' : 'pieces'}</button></div>
      </Drawer>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0">
      <legend className="eyebrow mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

function FilterPanel({ facets, params, toggleIn, set, setMany, clear }: { facets: FacetsDTO; params: Params; toggleIn: (k: string, v: string) => void; set: (k: string, v: string) => void; setMany: (u: Params) => void; clear: () => void }) {
  const has = (k: string, v: string) => (params[k] ?? '').split(',').includes(v);
  const [min, setMin] = useState(params.minPrice ? String(Number(params.minPrice) / 100) : '');
  const [max, setMax] = useState(params.maxPrice ? String(Number(params.maxPrice) / 100) : '');
  return (
    <div>
      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-royal" checked={params.inStock === 'true'} onChange={(e) => set('inStock', e.target.checked ? 'true' : '')} /> In stock only
        </label>
      </Group>
      {facets.sizes.length > 1 && (
        <Group title="Size">
          <div className="flex flex-wrap gap-2">
            {[...facets.sizes].sort((a, b) => sizeRank(a) - sizeRank(b)).map((s) => (
              <button key={s} type="button" aria-pressed={has('size', s)} onClick={() => toggleIn('size', s)} className={`min-h-9 border px-3 text-xs ${has('size', s) ? 'border-royal bg-royal text-ivory' : 'border-stone hover:border-royal'}`}>{prettySize(s)}</button>
            ))}
          </div>
        </Group>
      )}
      {facets.colours.length > 1 && (
        <Group title="Colour">
          <ul className="grid grid-cols-1 gap-2">
            {facets.colours.map((c) => (
              <li key={c}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-royal" checked={has('colour', c)} onChange={() => toggleIn('colour', c)} />
                  {swatchColour(c) && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-royal/25" style={{ background: swatchColour(c)! }} />}
                  {c}
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}
      {facets.materials.length > 1 && (
        <Group title="Material">
          <ul className="space-y-2">
            {facets.materials.map((m) => (
              <li key={m}><label className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-royal" checked={has('material', m)} onChange={() => toggleIn('material', m)} />{m}</label></li>
            ))}
          </ul>
        </Group>
      )}
      {facets.price.max > facets.price.min && (
        <Group title="Price (₹)">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const mn = min ? Math.round(Number(min) * 100) : '';
              const mx = max ? Math.round(Number(max) * 100) : '';
              setMany({ minPrice: mn === '' ? '' : String(mn), maxPrice: mx === '' ? '' : String(mx) });
            }}
          >
            <label className="sr-only" htmlFor="pmin">Minimum price</label>
            <input id="pmin" inputMode="numeric" className="field !min-h-10 !px-2 text-sm" placeholder={String(Math.floor(facets.price.min / 100))} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
            <span aria-hidden>–</span>
            <label className="sr-only" htmlFor="pmax">Maximum price</label>
            <input id="pmax" inputMode="numeric" className="field !min-h-10 !px-2 text-sm" placeholder={String(Math.ceil(facets.price.max / 100))} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            <button type="submit" className="btn btn-ghost !min-h-10 !px-3">Go</button>
          </form>
          <p className="mt-2 text-xs text-muted">{formatMoney(facets.price.min)} – {formatMoney(facets.price.max)}</p>
        </Group>
      )}
      <button type="button" className="eyebrow link-u mt-5" onClick={clear}>Clear all</button>
    </div>
  );
}
