'use client';
import { useRef } from 'react';
import type { ProductCardDTO } from '@cityroyalty/shared';
import { ChevronIcon } from '../ui/Icons';
import { ProductCard } from '../product/ProductCard';

/** Horizontal, touch-friendly slider (CSS scroll-snap) with keyboard-reachable arrows on desktop. */
export function ProductRail({ items, label, styledLead }: { items: ProductCardDTO[]; label: string; styledLead?: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <div className="relative">
      <ul ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:gap-6 md:px-0" aria-label={label} tabIndex={0}>
        {items.map((p) => (
          <li key={p.id} className="w-[62%] shrink-0 snap-start sm:w-[40%] md:w-[28%] xl:w-[23.2%]">
            <ProductCard product={p} sizes="(min-width:1280px) 22vw, (min-width:768px) 28vw, 62vw" quickView={false} styledLead={styledLead} />
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <div className="mt-6 hidden justify-end gap-2 md:flex">
          <button type="button" className="grid h-11 w-11 place-items-center border border-royal/30 hover:border-royal" onClick={() => scroll(-1)} aria-label={`Previous ${label}`}><ChevronIcon dir="left" /></button>
          <button type="button" className="grid h-11 w-11 place-items-center border border-royal/30 hover:border-royal" onClick={() => scroll(1)} aria-label={`Next ${label}`}><ChevronIcon dir="right" /></button>
        </div>
      )}
    </div>
  );
}
