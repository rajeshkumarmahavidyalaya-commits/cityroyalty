import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await api.article(slug);
  if (!a) return { title: 'Story not found', robots: { index: false } };
  return {
    title: a.seo.title ?? a.title,
    description: a.seo.description ?? (a.excerpt || undefined),
    alternates: { canonical: `/journal/${slug}` },
    openGraph: { type: 'article', title: a.title, publishedTime: a.publishedAt ?? undefined },
  };
}

export default async function Article({ params }: Props) {
  const { slug } = await params;
  const a = await api.article(slug);
  if (!a) notFound();
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.publishedAt, mainEntityOfPage: `${SITE_URL}/journal/${a.slug}`, publisher: { '@type': 'Organization', name: 'City Royalty' } };
  return (
    <article className="container-x py-14 md:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Link href="/journal" className="eyebrow link-u">← The Journal</Link>
      <header className="mx-auto mt-10 max-w-3xl">
        <p className="eyebrow text-tan">{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-7xl">{a.title}</h1>
      </header>
      <div className="prose-lux mx-auto mt-12" dangerouslySetInnerHTML={{ __html: a.body }} />
    </article>
  );
}
