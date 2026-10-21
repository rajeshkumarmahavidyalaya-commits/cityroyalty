import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await api.page(slug);
  return p ? { title: p.title, alternates: { canonical: `/pages/${slug}` } } : { title: 'Page not found', robots: { index: false } };
}

export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  const p = await api.page(slug);
  if (!p) notFound();
  return (
    <div className="container-x py-14 md:py-24">
      <h1 className="mx-auto max-w-3xl text-5xl md:text-7xl">{p.title}</h1>
      <div className="prose-lux mx-auto mt-12" dangerouslySetInnerHTML={{ __html: p.body }} />
    </div>
  );
}
