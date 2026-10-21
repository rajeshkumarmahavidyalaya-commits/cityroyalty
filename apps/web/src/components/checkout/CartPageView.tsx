'use client';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { CartLineView, DiscountField, Totals } from '../layout/CartDrawer';

export function CartPageView() {
  const { lines, priced } = useCart();
  return (
    <div className="container-x py-10 md:py-16">
      <h1 className="text-4xl md:text-6xl">Your bag</h1>
      {!lines.length ? (
        <div className="py-20">
          <p className="text-muted">Your bag is empty.</p>
          <Link href="/collections/all" className="btn btn-primary mt-6">Explore the collection</Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_24rem]">
          <ul className="divide-y divide-line border-y border-line">
            {priced ? priced.lines.map((l) => <CartLineView key={l.variantId} l={l} />) : <li className="py-8"><div className="skeleton h-28" /></li>}
          </ul>
          <aside className="h-fit space-y-5 bg-white p-6">
            <DiscountField />
            <Totals />
            <Link href="/checkout" aria-disabled={!priced?.ok} className={`btn btn-primary w-full ${priced?.ok ? '' : 'pointer-events-none opacity-45'}`}>Checkout</Link>
            <Link href="/collections/all" className="block text-center text-xs underline underline-offset-4">Continue shopping</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
