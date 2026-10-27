import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { faqLd, ldJson } from '@/lib/seo';

const summary = (html: string) => (html.match(/<p>([\s\S]*?)<\/p>/g) ?? []).map((p) => p.replace(/<[^>]+>/g, '').trim()).find((t) => t.length > 60)?.slice(0, 155);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await api.page(slug);
  return p ? { title: p.title, description: summary(p.body), alternates: { canonical: `/pages/${slug}` }, openGraph: { title: p.title, url: `/pages/${slug}` } } : { title: 'Page not found', robots: { index: false } };
}

export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  const p = await api.page(slug);
  if (!p) notFound();
  const page = { '@type': slug === 'about' ? 'AboutPage' : 'WebPage', name: p.title, url: `${SITE_URL}/pages/${slug}`, description: summary(p.body), isPartOf: { '@id': `${SITE_URL}/#website` }, inLanguage: 'en-IN' };
  const faq = slug === 'faqs' ? faqLd(p.body) : null;
  return (
    <div className="container-x py-14 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson({ '@context': 'https://schema.org', '@graph': faq ? [page, { ...faq, url: page.url }] : [page] }) }}
      />
      <h1 className="mx-auto max-w-3xl text-5xl md:text-7xl">{p.title}</h1>
      <div className="prose-lux mx-auto mt-12" dangerouslySetInnerHTML={{ __html: p.body }} />
    </div>
  );
}
