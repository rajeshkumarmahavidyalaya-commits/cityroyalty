'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductDTO, VariantDTO } from '@cityroyalty/shared';
import { formatMoney, percentOff, prettySize, sizeRank, swatchColour } from '@/lib/format';
import { useCart } from '@/lib/store';
import { Drawer } from '../ui/Drawer';
import { QtyStepper } from '../layout/CartDrawer';
import { WishlistButton } from './WishlistButton';

const isSize = (n: string) => /^size$/i.test(n);
const isColour = (n: string) => /^colou?r$/i.test(n);

interface Props {
  product: ProductDTO;
  sizeGuideHtml?: string | null;
  onColour?: (c: string | undefined) => void;
  compact?: boolean;
  stickyBar?: boolean;
}

export function ProductPurchase({ product: p, sizeGuideHtml, onColour, compact, stickyBar }: Props) {
  const { add } = useCart();
  const router = useRouter();
  const [sel, setSel] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const o of p.options) {
      if (o.values.length === 1) init[o.name] = o.values[0]!;
      else if (isColour(o.name)) {
        const firstAvail = p.variants.find((v) => v.available)?.options[o.name];
        init[o.name] = firstAvail ?? o.values[0]!;
      }
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [guide, setGuide] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState(false);
  const mainBtn = useRef<HTMLDivElement>(null);
  const [barVisible, setBarVisible] = useState(false);

  const variant: VariantDTO | undefined = useMemo(
    () => (p.options.every((o) => sel[o.name]) ? p.variants.find((v) => p.options.every((o) => v.options[o.name] === sel[o.name])) : undefined),
    [p, sel],
  );
  useEffect(() => onColour?.(sel['Color'] ?? sel['Colour']), [sel, onColour]);
  useEffect(() => { if (variant?.available) setQty((q) => Math.min(q, 10)); }, [variant]);

  useEffect(() => {
    if (!stickyBar || !mainBtn.current) return;
    const io = new IntersectionObserver(([e]) => setBarVisible(!!e && !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(mainBtn.current);
    return () => io.disconnect();
  }, [stickyBar]);

  const optionAvailable = (name: string, value: string) =>
    p.variants.some((v) => v.available && v.options[name] === value && p.options.every((o) => o.name === name || !sel[o.name] || v.options[o.name] === sel[o.name]));

  const shown = variant ?? null;
  const price = shown?.price ?? p.priceFrom;
  const compareAt = shown ? shown.compareAtPrice : p.compareAtFrom;
  const off = percentOff(price, compareAt);
  const missing = p.options.filter((o) => !sel[o.name]).map((o) => o.name.toLowerCase());
  const canBuy = !!variant?.available;

  function submit(buyNow: boolean) {
    if (!variant) return setErr(`Please select your ${missing.join(' and ')}.`);
    if (!variant.available) return setErr('That option is sold out.');
    setErr('');
    add(p, variant, qty, { openDrawer: !buyNow });
    if (buyNow) router.push('/checkout');
    else {
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    }
  }

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <p className="text-xl tabular-nums" aria-live="polite">{price > 0 ? formatMoney(price) : 'Price on request'}</p>
        {compareAt && price > 0 && (
          <>
            <s className="tabular-nums text-muted"><span className="sr-only">Original price </span>{formatMoney(compareAt)}</s>
            {off > 0 && <span className="eyebrow text-tan">Save {off}%</span>}
          </>
        )}
      </div>

      {p.options.map((o) => (
        <fieldset key={o.name} className="mt-6">
          <legend className="mb-2 flex w-full items-center justify-between text-sm">
            <span>
              {o.name}: <span className="font-medium">{sel[o.name] ? (isSize(o.name) ? prettySize(sel[o.name]!) : sel[o.name]) : 'Select'}</span>
            </span>
            {isSize(o.name) && (
              <button type="button" className="text-xs underline underline-offset-4" onClick={() => setGuide(true)}>Size guide</button>
            )}
          </legend>
          <div className="flex flex-wrap gap-2">
            {[...o.values].sort(isSize(o.name) ? (a, b) => sizeRank(a) - sizeRank(b) : undefined).map((val) => {
              const active = sel[o.name] === val;
              const avail = optionAvailable(o.name, val);
              const colour = isColour(o.name) ? swatchColour(val) : null;
              return (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${o.name} ${val}${avail ? '' : ' (sold out)'}`}
                  onClick={() => { setSel((s) => ({ ...s, [o.name]: val })); setErr(''); }}
                  className={`relative min-h-11 min-w-11 border px-4 text-sm transition-colors ${active ? 'border-royal bg-royal text-ivory' : 'border-stone hover:border-royal'} ${avail ? '' : 'text-muted/60 line-through decoration-[0.5px]'}`}
                >
                  {colour && <span className="mr-2 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-current/40" style={{ background: colour }} />}
                  {isSize(o.name) ? prettySize(val) : val}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <p className="mt-4 min-h-5 text-sm" role="status">
        {variant ? (
          variant.available ? (
            variant.madeToOrder ? <span className="text-royal">Made to order</span> : variant.lowStock ? <span className="text-tan">Only {variant.lowStock} left</span> : <span className="text-ok">In stock</span>
          ) : (
            <span className="text-danger">Sold out</span>
          )
        ) : null}
      </p>

      <div ref={mainBtn} className="mt-4 flex items-center gap-3">
        {canBuy && <QtyStepper qty={qty} max={variant?.madeToOrder ? 10 : null} onChange={(n) => setQty(Math.max(1, n))} label={p.title} />}
        <button type="button" className="btn btn-primary flex-1" onClick={() => submit(false)} disabled={!!variant && !variant.available}>
          {variant && !variant.available ? 'Sold out' : added ? 'Added to bag ✓' : 'Add to bag'}
        </button>
        <WishlistButton product={p} className="!h-12 !w-12 border border-stone" />
      </div>
      {!compact && (
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => submit(true)} disabled={!!variant && !variant.available}>
          Buy now
        </button>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}

      <Drawer open={guide} onClose={() => setGuide(false)} title="Size guide" side="center" className="w-[min(34rem,94vw)]">
        <div className="px-6 py-6 text-sm leading-relaxed">
          {sizeGuideHtml ? (
            <div className="prose-lux" dangerouslySetInnerHTML={{ __html: sizeGuideHtml }} />
          ) : (
            <>
              <p>This product is offered in the sizes below.</p>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {p.options.filter((o) => isSize(o.name)).flatMap((o) => o.values).sort((a, b) => sizeRank(a) - sizeRank(b)).map((v) => (
                  <li key={v} className="border border-line bg-white px-3 py-2">{prettySize(v)}</li>
                ))}
              </ul>
              <p className="mt-4 text-muted">Detailed garment measurements are being added. If you’re between sizes or unsure, contact us before ordering and we’ll help you choose.</p>
            </>
          )}
        </div>
      </Drawer>

      {stickyBar && (
        <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ivory/95 px-4 py-3 backdrop-blur transition-transform duration-300 lg:hidden ${barVisible ? 'translate-y-0' : 'translate-y-full'}`} aria-hidden={!barVisible}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{p.title}</p>
              <p className="text-sm tabular-nums text-muted">{price > 0 ? formatMoney(price) : ''}</p>
            </div>
            <button type="button" tabIndex={barVisible ? 0 : -1} className="btn btn-primary !min-h-11 !px-6" onClick={() => (variant ? submit(false) : mainBtn.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))} disabled={!!variant && !variant.available}>
              {variant ? (variant.available ? 'Add to bag' : 'Sold out') : `Select ${missing[0] ?? 'option'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
