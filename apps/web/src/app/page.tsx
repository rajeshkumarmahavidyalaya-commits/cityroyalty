import type { Metadata } from 'next';
import Link from 'next/link';
import type { CollectionDTO, ImageDTO } from '@cityroyalty/shared';
import { Hero } from '@/components/home/Hero';
import { ProductRail } from '@/components/home/ProductRail';
import { Newsletter } from '@/components/layout/Newsletter';
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

/**
 * Homepage, laid out after the brand's campaign board: dark hero → category tiles → the signature edit (featured pieces
 * only) → materials band → campaign band → journal → newsletter. Material/making statements are limited to what every
 * featured listing states (full-grain vegetable-tanned leather, made by artisans in India, YKK brass zips on jackets).
 */
export default async function Home() {
  const [cols, picks, articles, settings, campaigns] = await Promise.all([
    api.collections(),
    api.products({ featured: true, limit: 12 }),
    api.articles(),
    api.settings(),
    api.campaigns(),
  ]);
  const pieces = picks?.items ?? [];
  const campaign = (key: string) => campaigns?.items.find((c) => c.key === key);
  const hero = campaign('home-hero');
  const craft = campaign('home-craft');
  const band = campaign('home-editorial');

  // one tile per most-specific collection that holds a featured piece (e.g. men's / women's jackets, bags)
  const all = cols?.items ?? [];
  const leaves = all.filter((c) => !all.some((x) => x.parent === c.slug) && pieces.some((p) => p.collections.includes(c.slug)));
  const tiles = leaves.map((c) => {
    const p = pieces.find((x) => x.collections.includes(c.slug));
    return { c, image: p?.styledImage ?? p?.image ?? null };
  });
  const firstPhoto: ImageDTO | null = pieces[0]?.styledImage ?? pieces[0]?.image ?? null;
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
      <Hero campaign={hero} fallback={firstPhoto} />

      {tiles.length > 0 && (
        <section className="bg-royal pt-2" aria-labelledby="shop-col">
          <h2 id="shop-col" className="sr-only">Find your piece</h2>
          <ul className={`grid gap-2 px-2 ${tiles.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {tiles.map(({ c, image }, i) => (
              <Reveal as="li" key={c.slug} delay={i * 0.08}>
                <CategoryTile c={c} image={image} />
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {pieces.length > 0 && (
        <section className="section-y" aria-labelledby="edit">
          <div className="container-x grid gap-10 lg:grid-cols-[17rem_1fr] lg:gap-14">
            <Reveal>
              <h2 id="edit" className="display-caps text-3xl md:text-4xl">The signature edit</h2>
              <p className="mt-3 text-sm text-muted">Bold silhouettes. Timeless materials.</p>
              <span className="mt-6 block h-px w-12 bg-royal" aria-hidden />
              <Link href="/collections/all" className="eyebrow link-u mt-6 inline-block">Shop all</Link>
            </Reveal>
            <ProductRail items={pieces} label="The signature edit" styledLead />
          </div>
        </section>
      )}

      <section className="grid bg-royal text-ivory md:grid-cols-[1.05fr_1.25fr_0.95fr]" aria-labelledby="craft">
        <div className="relative min-h-72 md:min-h-[30rem]">
          {craft?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={craft.image} alt={craft.imageAlt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 bg-heritage" aria-hidden />
          )}
        </div>
        <Reveal className="on-dark flex flex-col justify-center px-6 py-14 md:px-12 lg:px-16">
          <p className="eyebrow text-stone">The craftsmanship</p>
          <h2 id="craft" className="display-caps mt-4 text-4xl md:text-5xl">{craft?.headline || 'Materials that matter'}</h2>
          <p className="mt-6 max-w-md text-ivory/80">
            {craft?.subline || 'Every piece in this edit is cut from full-grain, vegetable-tanned leather and made by artisans in India — leather chosen for its character and the way it wears in.'}
          </p>
          <Link href={craft?.ctaHref || '/pages/about'} className="btn btn-light mt-8 self-start">
            {craft?.ctaLabel || 'Our story'}
            <ArrowIcon width={18} height={18} />
          </Link>
        </Reveal>
        <ul className="flex flex-col justify-center gap-8 bg-stone/90 px-8 py-12 text-royal md:px-10">
          {[
            ['Full-grain leather', 'Vegetable-tanned, with natural grain left intact'],
            ['Made in India', 'By skilled artisans'],
            ['YKK brass zips', 'On every jacket in the edit'],
          ].map(([t, s]) => (
            <li key={t} className="flex gap-4">
              <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-heritage" aria-hidden />
              <div>
                <p className="eyebrow">{t}</p>
                <p className="mt-1 text-sm text-royal/70">{s}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {band?.image && (
        <section className="on-dark relative overflow-hidden bg-royal text-ivory" aria-labelledby="band">
          <div className="absolute inset-0 md:left-auto md:w-[55%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={band.image} alt={band.imageAlt} className="h-full w-full object-cover object-[50%_25%]" loading="lazy" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-royal via-royal/60 to-royal/10 md:hidden" aria-hidden />
          <div className="absolute inset-0 hidden md:block" style={{ background: 'linear-gradient(90deg,#080808 0%,#080808 42%,rgba(8,8,8,.55) 56%,rgba(8,8,8,0) 75%)' }} aria-hidden />
          <Reveal className="container-x relative flex min-h-[34rem] flex-col justify-end pb-14 pt-48 md:min-h-[30rem] md:justify-center md:py-20">
            <p className="eyebrow text-stone">The City Royalty collection</p>
            <h2 id="band" className="display-caps mt-4 max-w-[14ch] text-4xl md:text-6xl">{band.headline || 'Iconic outside. More within.'}</h2>
            {band.subline && <p className="mt-5 max-w-md text-ivory/80">{band.subline}</p>}
            <Link href={band.ctaHref || '/collections/jacket'} className="btn btn-ghost mt-8 self-start !border-ivory !text-ivory hover:!bg-ivory hover:!text-royal">
              {band.ctaLabel || 'Shop the jackets'}
              <ArrowIcon width={18} height={18} />
            </Link>
          </Reveal>
        </section>
      )}

      {journal.length > 0 && (
        <section className="section-y" aria-labelledby="journal">
          <div className="container-x">
            <Reveal className="mb-10 flex items-end justify-between md:mb-14">
              <div>
                <p className="eyebrow text-tan">The Journal</p>
                <h2 id="journal" className="display-caps mt-3 text-3xl md:text-5xl">Notes on leather</h2>
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
          <h2 id="nl" className="display-caps text-3xl md:text-5xl">Join our circle</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">New pieces and quiet announcements — never more than you want.</p>
          <div className="mx-auto max-w-md text-left"><Newsletter tone="light" /></div>
        </div>
      </section>
    </>
  );
}

function CategoryTile({ c, image }: { c: CollectionDTO; image: ImageDTO | null }) {
  return (
    <Link href={`/collections/${c.slug}`} className="group relative block overflow-hidden bg-heritage">
      {c.heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.heroImage} alt="" className="aspect-[4/5] w-full object-cover object-[50%_20%] transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04] md:aspect-[5/6]" loading="lazy" />
      ) : image ? (
        <ResponsiveImage image={image} sizes="(min-width:768px) 33vw, 100vw" ratio="5 / 6" alt="" imgClassName="transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.04]" />
      ) : (
        <div className="aspect-[5/6]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-royal/80 via-royal/10 to-transparent" aria-hidden />
      <div className="on-dark absolute inset-x-0 bottom-0 p-5 text-ivory md:p-7">
        <h3 className="display-caps text-2xl md:text-3xl">{c.title}</h3>
        <span className="mt-3 block h-px w-10 bg-ivory/70 transition-all duration-500 group-hover:w-16" aria-hidden />
        <p className="eyebrow mt-3 inline-flex items-center gap-2 text-stone">Explore <ArrowIcon width={14} height={14} className="transition-transform group-hover:translate-x-1" /></p>
      </div>
    </Link>
  );
}

