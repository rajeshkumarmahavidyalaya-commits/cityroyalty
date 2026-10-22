'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ProductCardDTO } from '@cityroyalty/shared';
import { formatMoney, percentOff } from '@/lib/format';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { QuickView } from './QuickView';
import { Swatches } from './Swatches';
import { WishlistButton } from './WishlistButton';

interface Props {
  product: ProductCardDTO;
  sizes?: string;
  priority?: boolean;
  layout?: 'grid' | 'list';
  quickView?: boolean;
  /** heading level for the product title; use 2 under an h1 list, 3 under an h2 section */
  headingLevel?: 2 | 3;
}

export function ProductCard({ product: p, sizes = '(min-width:1280px) 22vw, (min-width:768px) 30vw, 48vw', priority, layout = 'grid', quickView = true, headingLevel = 3 }: Props) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const [qv, setQv] = useState(false);
  const off = percentOff(p.priceFrom, p.compareAtFrom);
  const list = layout === 'list';
  return (
    <article className={`group relative ${list ? 'grid grid-cols-[38%_1fr] items-center gap-6 sm:grid-cols-[22%_1fr]' : ''}`}>
      {/* decorative duplicate of the title link below: hidden from AT and the tab order */}
      <Link href={`/products/${p.slug}`} className="block" aria-hidden tabIndex={-1}>
        <div className="relative overflow-hidden bg-line">
          {p.image ? (
            <>
              <ResponsiveImage image={p.image} sizes={sizes} ratio="4 / 5" priority={priority} />
              {p.hoverImage && (
                <div className="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-700 ease-[var(--ease-lux)] group-hover:opacity-100 md:block">
                  <ResponsiveImage image={p.hoverImage} sizes={sizes} ratio="4 / 5" />
                </div>
              )}
            </>
          ) : (
            <div className="grid aspect-[4/5] place-items-center text-xs text-muted">Photo coming soon</div>
          )}
          {!p.available && <span className="eyebrow absolute left-3 top-3 bg-ivory px-2 py-1">Sold out</span>}
          {p.available && off > 0 && <span className="eyebrow absolute left-3 top-3 bg-royal px-2 py-1 text-ivory">−{off}%</span>}
        </div>
      </Link>
      <WishlistButton product={p} className="absolute right-2.5 top-2.5" />
      {quickView && !list && (
        <button
          type="button"
          onClick={() => setQv(true)}
          className="eyebrow absolute inset-x-3 bottom-[5.2rem] hidden translate-y-2 bg-ivory/95 py-3 text-center opacity-0 backdrop-blur transition-all duration-300 hover:bg-royal hover:text-ivory focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block"
        >
          Quick view
        </button>
      )}
      <div className={list ? '' : 'pt-3'}>
        <Heading className="font-sans text-[0.95rem] font-normal leading-snug tracking-normal">
          <Link href={`/products/${p.slug}`} className="link-u">{p.title}</Link>
        </Heading>
        <div className="mt-1.5 flex items-baseline gap-2 text-sm">
          {p.priceFrom > 0 ? (
            <>
              <span className="tabular-nums">{formatMoney(p.priceFrom)}</span>
              {p.compareAtFrom && <s className="tabular-nums text-muted">{formatMoney(p.compareAtFrom)}</s>}
            </>
          ) : (
            <span className="text-muted">Price on request</span>
          )}
        </div>
        <div className="mt-2 min-h-3"><Swatches colours={p.colours} /></div>
      </div>
      {quickView && <QuickView slug={p.slug} open={qv} onClose={() => setQv(false)} />}
    </article>
  );
}
