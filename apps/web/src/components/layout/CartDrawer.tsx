'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { PricedLineDTO } from '@cityroyalty/shared';
import { useCart } from '@/lib/store';
import { formatMoney } from '@/lib/format';
import { Drawer } from '../ui/Drawer';
import { MinusIcon, PlusIcon } from '../ui/Icons';
import { ResponsiveImage } from '../ui/ResponsiveImage';

export function QtyStepper({ qty, max, onChange, label }: { qty: number; max: number | null; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center border border-stone" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="grid h-9 w-9 place-items-center disabled:opacity-30" aria-label="Decrease quantity" onClick={() => onChange(qty - 1)}>
        <MinusIcon width={16} height={16} />
      </button>
      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{qty}</span>
      <button type="button" className="grid h-9 w-9 place-items-center disabled:opacity-30" aria-label="Increase quantity" disabled={max != null && qty >= max} onClick={() => onChange(qty + 1)}>
        <PlusIcon width={16} height={16} />
      </button>
    </div>
  );
}

export function CartLineView({ l, compact }: { l: PricedLineDTO; compact?: boolean }) {
  const { setQty, remove } = useCart();
  const bad = l.issue;
  return (
    <li className="flex gap-4 py-5">
      <Link href={l.slug ? `/products/${l.slug}` : '#'} className="w-24 shrink-0">
        {l.image ? <ResponsiveImage image={l.image} sizes="96px" ratio="4 / 5" /> : <div className="aspect-[4/5] bg-line" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <p className="text-sm leading-snug">{l.title}</p>
          <p className="text-sm tabular-nums">{formatMoney(l.lineTotal)}</p>
        </div>
        {l.optionsLabel && <p className="mt-0.5 text-xs text-muted">{l.optionsLabel}</p>}
        {bad && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {bad === 'insufficient_stock' ? `Only ${l.maxQty} available` : bad === 'unavailable' ? 'Currently unavailable' : 'No longer available'}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          {!compact && l.maxQty !== 0 ? (
            <QtyStepper qty={l.qty} max={l.maxQty} label={l.title} onChange={(n) => setQty(l.variantId, n)} />
          ) : (
            <span className="text-xs text-muted">Qty {l.qty}</span>
          )}
          <button type="button" className="text-xs underline underline-offset-4" onClick={() => remove(l.variantId)}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function DiscountField() {
  const { applyCode, discountCode, priced } = useCart();
  const [v, setV] = useState('');
  return (
    <div>
      {priced?.discount ? (
        <p className="flex items-center justify-between text-sm">
          <span>Code <b className="font-semibold">{priced.discount.code}</b> applied</span>
          <button type="button" className="underline underline-offset-4" onClick={() => void applyCode('')}>Remove</button>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (v.trim()) void applyCode(v);
          }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor="disc">Discount code</label>
          <input id="disc" className="field !min-h-11 flex-1 uppercase" placeholder="Discount code" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
          <button className="btn btn-ghost !min-h-11 !px-5" type="submit">Apply</button>
        </form>
      )}
      {priced?.discountError && discountCode && <p role="alert" className="mt-2 text-xs text-danger">{priced.discountError}</p>}
    </div>
  );
}

export function Totals() {
  const { priced } = useCart();
  if (!priced) return null;
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(priced.subtotal)}</dd></div>
      {priced.discount && priced.discount.amount > 0 && (
        <div className="flex justify-between text-ok"><dt>Discount ({priced.discount.code})</dt><dd className="tabular-nums">−{formatMoney(priced.discount.amount)}</dd></div>
      )}
      <div className="flex justify-between">
        <dt>Shipping</dt>
        <dd className="tabular-nums">{priced.shipping == null ? 'Calculated at checkout' : priced.shipping === 0 ? 'Free' : formatMoney(priced.shipping)}</dd>
      </div>
      {priced.total != null && (
        <div className="flex justify-between border-t border-line pt-3 text-base font-medium"><dt>Total</dt><dd className="tabular-nums">{formatMoney(priced.total)}</dd></div>
      )}
      {priced.shippingNote && <p className="text-xs text-muted">{priced.shippingNote}</p>}
    </dl>
  );
}

export function CartDrawer({ freeThreshold }: { freeThreshold: number | null }) {
  const { open, setOpen, priced, count, lines, pricing } = useCart();
  const remaining = freeThreshold != null && priced ? Math.max(0, freeThreshold - priced.subtotal) : null;
  return (
    <Drawer open={open} onClose={() => setOpen(false)} title={`Your bag${count ? ` (${count})` : ''}`}>
      {!lines.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="font-serif text-2xl">Your bag is empty</p>
          <p className="text-sm text-muted">Pieces you add will wait here for you.</p>
          <Link href="/collections/all" className="btn btn-primary" onClick={() => setOpen(false)}>Explore the collection</Link>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5">
            {remaining != null && priced && (
              <p className="mt-4 bg-white px-3 py-2 text-xs" role="status">
                {remaining === 0 ? 'You’ve unlocked free shipping.' : `Add ${formatMoney(remaining)} more for free shipping.`}
              </p>
            )}
            <ul className="divide-y divide-line">
              {priced ? priced.lines.map((l) => <CartLineView key={l.variantId} l={l} />) : <li className="py-8"><div className="skeleton h-28 w-full" /></li>}
            </ul>
          </div>
          <div className="space-y-4 border-t border-line bg-white/60 px-5 py-5" aria-busy={pricing}>
            <DiscountField />
            <Totals />
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              aria-disabled={!priced?.ok}
              className={`btn btn-primary w-full ${priced?.ok ? '' : 'pointer-events-none opacity-45'}`}
            >
              Checkout
            </Link>
            <Link href="/cart" onClick={() => setOpen(false)} className="block text-center text-xs underline underline-offset-4">View full bag</Link>
          </div>
        </>
      )}
    </Drawer>
  );
}
