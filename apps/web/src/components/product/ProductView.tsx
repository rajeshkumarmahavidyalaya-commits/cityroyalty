'use client';
import { useState, type ReactNode } from 'react';
import type { ProductDTO } from '@cityroyalty/shared';
import { Gallery } from './Gallery';
import { ProductPurchase } from './ProductPurchase';

/** Gallery + purchase panel share the selected colour; the details accordion is passed in from the server. */
export function ProductView({ product, sizeGuideHtml, details, eyebrow }: { product: ProductDTO; sizeGuideHtml: string | null; details: ReactNode; eyebrow: ReactNode }) {
  const [colour, setColour] = useState<string | undefined>();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
      <Gallery images={product.images} styling={product.styling} title={product.title} activeColour={colour} />
      <div className="lg:sticky lg:top-28 lg:self-start">
        {eyebrow}
        <h1 className="mt-2 text-[2rem] leading-tight md:text-5xl">{product.title}</h1>
        <p className="mt-2 text-xs text-muted">SKU {product.sku}</p>
        <div className="mt-6">
          <ProductPurchase product={product} sizeGuideHtml={sizeGuideHtml} onColour={setColour} stickyBar />
        </div>
        <div className="mt-10">{details}</div>
      </div>
    </div>
  );
}
