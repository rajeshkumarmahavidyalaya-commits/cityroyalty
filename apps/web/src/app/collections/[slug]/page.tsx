import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CollectionBrowser } from '@/components/collection/CollectionBrowser';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const KEYS = ['sort', 'size', 'colour', 'material', 'minPrice', 'maxPrice', 'inStock'] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === 'all') return { title: 'Shop all', description: 'Browse every City Royalty leather piece.', alternates: { canonical: '/collections/all' } };
  const c = await api.collection(slug);
  if (!c) return { title: 'Collection not found', robots: { index: false } };
  const title = c.seo.title ?? c.title;
  const description = c.seo.description ?? (c.description || `Shop ${c.title} from City Royalty.`);
  return { title, description, alternates: { canonical: `/collections/${slug}` }, openGraph: { title, description } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const isAll = slug === 'all';
  const [col, cols] = await Promise.all([isAll ? null : api.collection(slug), api.collections()]);
  if (!isAll && !col) notFound();

  const p: Record<string, string> = {};
  for (const k of KEYS) if (first(sp[k])) p[k] = first(sp[k]);
  const query = { collection: isAll ? undefined : slug, ...p, limit: 24 };
  const list = await api.products(query);
  const apiQuery = new URLSearchParams({ ...(isAll ? {} : { collection: slug }), ...p, limit: '24' }).toString();

  const title = isAll ? 'The collection' : col!.title;
  const description = isAll ? 'Every City Royalty piece, in one place.' : col!.description;
  const siblings = (cols?.items ?? []).filter((c) => (col?.parent ? c.parent === col.parent : !c.parent || true));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: title, item: `${SITE_URL}/collections/${slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="bg-stone/35">
        <div className={`container-x py-14 md:py-24 ${col?.heroImage ? 'grid items-center gap-10 md:grid-cols-[1fr_auto]' : ''}`}>
          <div>
            <nav aria-label="Breadcrumb" className="mb-5 text-xs text-muted">
              <Link href="/" className="hover:underline">Home</Link> <span aria-hidden>/</span> <span aria-current="page" className="text-royal">{title}</span>
            </nav>
            <h1 className="max-w-4xl text-5xl md:text-7xl">{title}</h1>
            {description && <p className="mt-5 max-w-xl text-muted">{description}</p>}
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Collections">
              <li><Link href="/collections/all" className={`eyebrow border px-4 py-2 ${isAll ? 'border-royal bg-royal text-ivory' : 'border-royal/40 hover:border-royal'}`}>All</Link></li>
              {siblings.map((c) => (
                <li key={c.slug}><Link href={`/collections/${c.slug}`} className={`eyebrow border px-4 py-2 ${c.slug === slug ? 'border-royal bg-royal text-ivory' : 'border-royal/40 hover:border-royal'}`}>{c.title}</Link></li>
              ))}
            </ul>
          </div>
          {col?.heroImage && (
            // editorial mood image set per collection in admin (decorative: the title says what the page is)
            // eslint-disable-next-line @next/next/no-img-element
            <img src={col.heroImage} alt="" className="aspect-[4/5] w-full max-w-md object-cover md:w-[min(26rem,38vw)]" />
          )}
        </div>
      </section>
      {list ? (
        <CollectionBrowser key={JSON.stringify(p) + slug} initial={list} facets={list.facets} params={p} apiQuery={apiQuery} />
      ) : (
        <div className="container-x py-24 text-center"><p className="font-serif text-3xl">The collection is taking a moment</p><p className="mt-2 text-muted">Please refresh in a few seconds.</p></div>
      )}
    </>
  );
}
