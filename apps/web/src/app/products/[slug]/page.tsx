import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Accordion } from '@/components/ui/Accordion';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductView } from '@/components/product/ProductView';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { formatMoney } from '@/lib/format';

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
  const description = p.seo.description ?? (p.description ? p.description.slice(0, 155) : `${p.title} from City Royalty.`);
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
  const [data, settings, guide] = await Promise.all([api.product(slug), api.settings(), api.page('size-guide')]);
  if (!data) notFound();
  const { product: p, related } = data;
  const paras = p.description.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  const thr = settings?.shipping.freeThreshold;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: p.title,
        sku: p.sku,
        description: p.description || undefined,
        image: p.images.map((i) => i.src),
        brand: { '@type': 'Brand', name: 'City Royalty' },
        offers: p.variants.length
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'INR',
              lowPrice: (Math.min(...p.variants.map((v) => v.price)) / 100).toFixed(2),
              highPrice: (Math.max(...p.variants.map((v) => v.price)) / 100).toFixed(2),
              offerCount: p.variants.length,
              availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: `${SITE_URL}/products/${p.slug}`,
            }
          : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/collections/all` },
          { '@type': 'ListItem', position: 3, name: p.title, item: `${SITE_URL}/products/${p.slug}` },
        ],
      },
    ],
  };

  const details = (
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
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
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

      {p.styling?.length > 0 && (
        <section className="section-y border-t border-line" aria-labelledby="styled">
          <div className="container-x">
            <p className="eyebrow text-tan">Inspiration</p>
            <h2 id="styled" className="mt-3 text-3xl md:text-4xl">Styled look</h2>
            <p className="mt-3 max-w-xl text-sm text-muted">Styling imagery of a similar look. The piece shown may differ in details — the photographs above show this exact product.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
              {p.styling.map((im) => (
                <li key={im.id}><ResponsiveImage image={im} sizes="(min-width:768px) 22vw, 45vw" ratio="4 / 5" /></li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
