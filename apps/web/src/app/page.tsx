import type { Metadata } from 'next';
import Link from 'next/link';
import type { CollectionDTO, ImageDTO } from '@cityroyalty/shared';
import { Hero3D } from '@/components/home/Hero3D';
import { ProductRail } from '@/components/home/ProductRail';
import { Newsletter } from '@/components/layout/Newsletter';
import { ProductCard } from '@/components/product/ProductCard';
import { ArrowIcon } from '@/components/ui/Icons';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { Reveal } from '@/components/ui/Reveal';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

export const metadata: Metadata = {
  title: { absolute: 'City Royalty — Leather jackets, bags & accessories from India' },
  description: 'Wear a higher standard. Timeless leather jackets, bags, belts and accessories — modern expression from City Royalty.',
  alternates: { canonical: '/' },
};

/** Leading paragraphs of a CMS page, as plain strings. */
const paragraphs = (html: string | undefined, n = 2): string[] =>
  [...(html ?? '').matchAll(/<p>([\s\S]*?)<\/p>/g)]
    .map((m) => m[1]!.replace(/<[^>]+>/g, '').trim())
    .filter((t) => t.length > 90)
    .slice(0, n);

export default async function Home() {
  const [cols, newest, featuredRes, articles, about, settings, campaigns] = await Promise.all([
    api.collections(),
    api.products({ sort: 'newest', limit: 8 }),
    api.products({ featured: true, limit: 8 }),
    api.articles(),
    api.page('about'),
    api.settings(),
    api.campaigns(),
  ]);

  // one representative real photo per collection tile
  const top = (cols?.items ?? []).filter((c) => !c.parent || !cols?.items.some((x) => x.slug === c.parent)).slice(0, 6);
  const tiles = await Promise.all(
    top.map(async (c) => {
      const r = await api.products({ collection: c.slug, limit: 1 });
      return { c, image: r?.items[0]?.image ?? null };
    }),
  );
  const poster: ImageDTO | null = tiles.find((t) => t.c.slug === 'jacket' || t.c.slug === 'mens-jacket')?.image ?? tiles[0]?.image ?? null;
  const featured = (featuredRes?.items.length ? featuredRes.items : newest?.items ?? []).slice(0, 8);
  const editorial = campaigns?.items.find((c) => c.key === 'home-editorial');
  const story = paragraphs(about?.body);
  const journal = (articles?.items ?? []).slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'City Royalty',
    url: SITE_URL,
    sameAs: [settings?.social.instagram, settings?.social.facebook].filter(Boolean),
    email: settings?.supportEmail,
    telephone: settings?.supportPhone,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero3D poster={poster} />

      {tiles.length > 0 && (
        <section className="section-y" aria-labelledby="shop-col">
          <div className="container-x">
            <Reveal className="mb-10 flex items-end justify-between gap-6 md:mb-14">
              <div>
                <p className="eyebrow text-tan">Shop by collection</p>
                <h2 id="shop-col" className="mt-3 text-4xl md:text-6xl">Find your piece</h2>
              </div>
              <Link href="/collections/all" className="eyebrow link-u hidden pb-2 md:inline-block">View all</Link>
            </Reveal>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
              {tiles.map(({ c, image }, i) => (
                <Reveal as="li" key={c.slug} delay={(i % 3) * 0.08} className={i === 0 ? 'col-span-2 md:col-span-1 md:row-span-1' : ''}>
                  <CollectionTile c={c} image={image} />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      {(newest?.items.length ?? 0) > 0 && (
        <section className="section-y pt-0" aria-labelledby="new">
          <div className="container-x">
            <Reveal className="mb-8 flex items-end justify-between md:mb-12">
              <div>
                <p className="eyebrow text-tan">Just in</p>
                <h2 id="new" className="mt-3 text-4xl md:text-6xl">New arrivals</h2>
              </div>
              <Link href="/collections/all?sort=newest" className="eyebrow link-u pb-2">Shop new</Link>
            </Reveal>
            <ProductRail items={newest!.items} label="new arrivals" />
          </div>
        </section>
      )}

      <section className="on-dark bg-heritage text-ivory" aria-labelledby="editorial">
        <div className="container-x grid items-center gap-10 py-16 md:grid-cols-2 md:gap-20 md:py-28">
          <Reveal>
            {(editorial?.image ? null : poster) && !editorial?.image && poster && <ResponsiveImage image={poster} sizes="(min-width:768px) 45vw, 100vw" ratio="4 / 5" />}
            {editorial?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editorial.image} alt={editorial.imageAlt} className="aspect-[4/5] w-full object-cover" loading="lazy" />
            )}
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow text-stone">The edit</p>
            <h2 id="editorial" className="mt-4 text-4xl md:text-7xl">{editorial?.headline || 'Timeless leather. Modern expression.'}</h2>
            <p className="mt-6 max-w-md text-ivory/85 md:text-lg">
              {editorial?.subline || 'Confident silhouettes in leather, made to be worn hard and kept for years. Discover the pieces that define the City Royalty standard.'}
            </p>
            <Link href={editorial?.ctaHref || '/collections/all'} className="btn btn-light mt-9">{editorial?.ctaLabel || 'Explore collection'}<ArrowIcon width={18} height={18} /></Link>
          </Reveal>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section-y" aria-labelledby="feat">
          <div className="container-x">
            <Reveal className="mb-10 text-center md:mb-14">
              <p className="eyebrow text-tan">Curated</p>
              <h2 id="feat" className="mt-3 text-4xl md:text-6xl">Featured pieces</h2>
            </Reveal>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
              {featured.slice(0, 8).map((p, i) => (
                <Reveal as="li" key={p.id} delay={(i % 4) * 0.06}><ProductCard product={p} quickView={false} /></Reveal>
              ))}
            </ul>
            <div className="mt-14 text-center"><Link href="/collections/all" className="btn btn-ghost">Shop all</Link></div>
          </div>
        </section>
      )}

      <section className="border-y border-line bg-white/50" aria-labelledby="craft">
        <div className="container-x grid gap-10 py-16 md:grid-cols-12 md:py-28">
          <Reveal className="md:col-span-5">
            <p className="eyebrow text-tan">Our story</p>
            <h2 id="craft" className="mt-4 text-4xl md:text-6xl">Craft you can feel</h2>
            {(settings?.brandFacts.length ?? 0) > 0 && (
              <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
                {settings!.brandFacts.map((f) => (<li key={f} className="flex gap-3"><span aria-hidden className="mt-2 h-px w-5 bg-tan" />{f}</li>))}
              </ul>
            )}
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-6 md:col-start-7">
            {story.length ? story.map((t, i) => (<p key={i} className="mb-5 text-lg leading-relaxed text-royal/90 last:mb-0">{t}</p>)) : (
              <p className="text-lg leading-relaxed text-royal/90">{settings?.storeName ?? 'City Royalty'} — high quality leather goods from India.</p>
            )}
            <Link href="/pages/about" className="eyebrow link-u mt-8 inline-block">Read more about us</Link>
          </Reveal>
        </div>
      </section>

      {journal.length > 0 && (
        <section className="section-y" aria-labelledby="journal">
          <div className="container-x">
            <Reveal className="mb-10 flex items-end justify-between md:mb-14">
              <div>
                <p className="eyebrow text-tan">The Journal</p>
                <h2 id="journal" className="mt-3 text-4xl md:text-6xl">Notes on leather</h2>
              </div>
              <Link href="/journal" className="eyebrow link-u pb-2">All stories</Link>
            </Reveal>
            <ul className="grid gap-px bg-line md:grid-cols-3">
              {journal.map((a, i) => (
                <Reveal as="li" key={a.id} delay={i * 0.07} className="bg-ivory">
                  <Link href={`/journal/${a.slug}`} className="group flex h-full min-h-72 flex-col justify-between p-7 transition-colors hover:bg-white md:p-9">
                    <div>
                      <p className="eyebrow text-tan">{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }) : 'Journal'}</p>
                      <h3 className="mt-4 text-3xl leading-tight">{a.title}</h3>
                    </div>
                    <p className="eyebrow mt-8 inline-flex items-center gap-2">Read <ArrowIcon width={16} height={16} className="transition-transform group-hover:translate-x-1" /></p>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-stone/40" aria-labelledby="nl">
        <div className="container-x py-16 text-center md:py-24">
          <h2 id="nl" className="text-4xl md:text-6xl">Be the first to know</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">New arrivals and quiet announcements — never more than you want.</p>
          <div className="mx-auto max-w-md text-left"><Newsletter tone="light" /></div>
        </div>
      </section>
    </>
  );
}

function CollectionTile({ c, image }: { c: CollectionDTO; image: ImageDTO | null }) {
  return (
    <Link href={`/collections/${c.slug}`} className="group relative block overflow-hidden bg-line">
      {image ? (
        <ResponsiveImage image={image} sizes="(min-width:768px) 32vw, 50vw" ratio="4 / 5" imgClassName="transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04]" />
      ) : (
        <div className="aspect-[4/5]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-royal/70 via-royal/5 to-transparent" aria-hidden />
      <div className="on-dark absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-ivory md:p-6">
        <div>
          <h3 className="text-2xl leading-tight md:text-3xl">{c.title}</h3>
          <p className="eyebrow mt-1 text-stone">{c.count} {c.count === 1 ? 'piece' : 'pieces'}</p>
        </div>
        <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
