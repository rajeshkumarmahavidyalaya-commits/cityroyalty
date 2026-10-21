'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProductDTO } from '@cityroyalty/shared';
import { call } from '@/lib/client-api';
import { Drawer } from '../ui/Drawer';
import { Gallery } from './Gallery';
import { ProductPurchase } from './ProductPurchase';

export function QuickView({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const [p, setP] = useState<ProductDTO | null>(null);
  const [err, setErr] = useState(false);
  const [colour, setColour] = useState<string | undefined>();
  useEffect(() => {
    if (!open || p) return;
    call<{ product: ProductDTO }>(`/products/${encodeURIComponent(slug)}`)
      .then((r) => setP(r.product))
      .catch(() => setErr(true));
  }, [open, p, slug]);
  return (
    <Drawer open={open} onClose={onClose} title={p?.title ?? 'Quick view'} side="center" className="!w-[min(60rem,96vw)]">
      <div className="grid gap-8 p-5 md:grid-cols-2 md:p-8">
        {err && <p role="alert" className="col-span-2">We couldn’t load this product. <Link className="underline" href={`/products/${slug}`}>Open the product page</Link></p>}
        {!p && !err && <div className="skeleton col-span-2 aspect-[16/9]" aria-busy />}
        {p && (
          <>
            <Gallery images={p.images.slice(0, 5)} title={p.title} activeColour={colour} />
            <div>
              <h3 className="font-serif text-3xl">{p.title}</h3>
              <div className="mt-3"><ProductPurchase product={p} compact onColour={setColour} /></div>
              <Link href={`/products/${p.slug}`} onClick={onClose} className="eyebrow link-u mt-6 inline-block">View full details</Link>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
