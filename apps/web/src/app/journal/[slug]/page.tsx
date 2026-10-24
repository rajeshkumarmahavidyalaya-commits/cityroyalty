import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { BRAND, ldJson } from '@/lib/seo';

/** First real paragraph of an article, as plain text, for descriptions. */
const summary = (html: string) => (html.match(/<p>([\s\S]*?)<\/p>/g) ?? []).map((p) => p.replace(/<[^>]+>/g, '').trim()).find((t) => t.length > 60)?.slice(0, 155);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await api.article(slug);
  if (!a) return { title: 'Story not found', robots: { index: false } };
  const description = a.seo.description ?? (a.excerpt || summary(a.body));
  return {
    title: a.seo.title ?? a.title,
    description,
    alternates: { canonical: `/journal/${slug}` },
    openGraph: { type: 'article', title: a.title, description, url: `/journal/${slug}`, publishedTime: a.publishedAt ?? undefined, images: a.coverImage ? [{ url: a.coverImage }] : undefined },
  };
}

export default async function Article({ params }: Props) {
  const { slug } = await params;
  const a = await api.article(slug);
  if (!a) notFound();
  const url = `${SITE_URL}/journal/${a.slug}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.excerpt || summary(a.body),
    image: a.coverImage || undefined,
    datePublished: a.publishedAt,
    dateModified: a.publishedAt,
    inLanguage: 'en-IN',
    mainEntityOfPage: url,
    url,
    author: { '@type': 'Organization', name: BRAND, url: SITE_URL },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
  return (
    <article className="container-x py-14 md:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <Link href="/journal" className="eyebrow link-u">← The Journal</Link>
      <header className="mx-auto mt-10 max-w-3xl">
        <p className="eyebrow text-tan">{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-7xl">{a.title}</h1>
      </header>
      <div className="prose-lux mx-auto mt-12" dangerouslySetInnerHTML={{ __html: a.body }} />
    </article>
  );
}
