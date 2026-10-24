import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Accordion } from '@/components/ui/Accordion';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductView } from '@/components/product/ProductView';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { formatMoney } from '@/lib/format';
import { BRAND, factAttributes, ldJson, productFacts, productMetaDescription } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };

/** Pre-render the catalogue; products published later render on first request (ISR) and are cached. */
export async function generateStaticParams() {
  const list = await api.products({ limit: 60 });
  return (list?.items ?? []).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await api.product(slug);
  if (!data) return { title: 'Product not found', robots: { index: false } };
  const p = data.product;
  const title = p.seo.title ?? p.title;
  const description = p.seo.description ?? productMetaDescription(p, productFacts(p.description));
  const img = p.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    robots: p.seo.noindex ? { index: false } : undefined,
    openGraph: { title, description, type: 'website', url: `/products/${p.slug}`, images: img ? [{ url: img.src, width: img.width, height: img.height, alt: img.alt }] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [data, settings, guide, cols] = await Promise.all([api.product(slug), api.settings(), api.page('size-guide'), api.collections()]);
  if (!data) notFound();
  const { product: p, related } = data;
  const facts = productFacts(p.description);
  const { material, madeInIndia } = factAttributes(facts);
  // most specific collection the product belongs to, for the breadcrumb and category
  const all = cols?.items ?? [];
  const mine = all.filter((c) => p.collections.includes(c.slug));
  const collection = mine.find((c) => !mine.some((x) => x.parent === c.slug)) ?? mine[0];
  const parent = collection?.parent ? all.find((c) => c.slug === collection.parent) : undefined;
  const url = `${SITE_URL}/products/${p.slug}`;
  const paras = p.description.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  const thr = settings?.shipping.freeThreshold;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        url,
        name: p.title,
        sku: p.sku,
        description: productMetaDescription(p, facts),
        image: p.images.map((i) => i.src), // photographs of this piece only
        brand: { '@type': 'Brand', name: BRAND },
        manufacturer: { '@id': `${SITE_URL}/#organization` },
        category: [parent?.title, collection?.title].filter(Boolean).join(' > ') || undefined,
        material,
        countryOfOrigin: madeInIndia ? { '@type': 'Country', name: 'India' } : undefined,
        color: p.colours.length ? p.colours.join(', ') : undefined,
        size: p.sizes.length ? p.sizes.join(', ') : undefined,
        additionalProperty: facts.length ? facts.map((f) => ({ '@type': 'PropertyValue', name: 'Feature', value: f })) : undefined,
        offers: p.variants.length
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'INR',
              lowPrice: (Math.min(...p.variants.map((v) => v.price)) / 100).toFixed(2),
              highPrice: (Math.max(...p.variants.map((v) => v.price)) / 100).toFixed(2),
              offerCount: p.variants.length,
              itemCondition: 'https://schema.org/NewCondition',
              availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              seller: { '@id': `${SITE_URL}/#organization` },
              url,
            }
          : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { name: 'Home', item: SITE_URL },
          ...(parent ? [{ name: parent.title, item: `${SITE_URL}/collections/${parent.slug}` }] : []),
          collection ? { name: collection.title, item: `${SITE_URL}/collections/${collection.slug}` } : { name: 'Shop', item: `${SITE_URL}/collections/all` },
          { name: p.title, item: url },
        ].map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })),
      },
    ],
  };

  // answer-ready summary: the listing's own facts, stated plainly and visible (AEO); nothing inferred
  const keyFacts = facts.length > 0 && (
    <section aria-labelledby="facts" className="mb-6 border border-line bg-white/60 p-5">
      <h2 id="facts" className="eyebrow mb-3">Key facts</h2>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Brand</dt><dd>{BRAND}</dd>
        {collection && (<><dt className="text-muted">Category</dt><dd>{collection.title}</dd></>)}
        {material && (<><dt className="text-muted">Material</dt><dd>{material}</dd></>)}
        {madeInIndia && (<><dt className="text-muted">Made in</dt><dd>India</dd></>)}
        {p.priceFrom > 0 && (<><dt className="text-muted">Price</dt><dd>{formatMoney(p.priceFrom)}</dd></>)}
        <dt className="text-muted">SKU</dt><dd>{p.sku}</dd>
      </dl>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
        {facts.map((f) => (<li key={f}>{f}</li>))}
      </ul>
    </section>
  );

  const details = (
    <>
      {keyFacts}
      <Accordion
        items={[
          { title: 'Description', open: true, content: paras.length ? paras.map((t, i) => (t.length < 40 && !/[.!?]$/.test(t) ? <h3 key={i} className="mb-1 mt-4 font-sans text-xs font-semibold uppercase tracking-[0.14em] first:mt-0">{t}</h3> : <p key={i} className="mb-3 last:mb-0">{t}</p>)) : <p className="text-muted">Details for this piece are being prepared.</p> },
          ...(p.material || p.care || p.highlights.length
            ? [{
                title: 'Materials & care',
                content: (
                  <div className="space-y-3">
                    {p.highlights.length > 0 && <ul className="list-disc pl-5">{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                    {p.material && <p><b className="font-medium">Material: </b>{p.material}</p>}
                    {p.care && <p><b className="font-medium">Care: </b>{p.care}</p>}
                  </div>
                ),
              }]
            : []),
          {
            title: 'Shipping & returns',
            content: (
              <div className="space-y-3">
                {thr != null && <p>Free shipping on orders over {formatMoney(thr)}.</p>}
                {settings?.shipping.estimate && <p>Delivery: {settings.shipping.estimate}</p>}
                {settings?.returns.summary && <p>{settings.returns.summary}</p>}
                <p>
                  Read our <Link className="underline underline-offset-4" href="/pages/refund-and-returns">refund &amp; returns policy</Link> for details.
                </p>
              </div>
            ),
          },
        ]}
      />
    </>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <div className="container-x pb-20 pt-6 md:pt-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap gap-2">
            <li><Link href="/" className="hover:underline">Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/collections/all" className="hover:underline">Shop</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-royal">{p.title}</li>
          </ol>
        </nav>
        <ProductView
          product={p}
          sizeGuideHtml={guide?.body ?? null}
          details={details}
          eyebrow={<p className="eyebrow text-tan">City Royalty</p>}
        />
      </div>

      {related.length > 0 && (
        <section className="section-y border-t border-line" aria-labelledby="rel">
          <div className="container-x">
            <h2 id="rel" className="mb-8 text-3xl md:text-4xl">You may also like</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {related.slice(0, 4).map((r) => (<li key={r.id}><ProductCard product={r} quickView={false} /></li>))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
