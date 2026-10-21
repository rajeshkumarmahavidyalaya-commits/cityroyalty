import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cols, products, articles] = await Promise.all([api.collections(), api.products({ limit: 60 }), api.articles()]);
  const all = products?.items ?? [];
  // page through the catalogue so large catalogues are fully listed
  for (let p = 2; products && p <= products.pages; p++) all.push(...((await api.products({ limit: 60, page: p }))?.items ?? []));
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/collections/all`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...(cols?.items ?? []).map((c) => ({ url: `${SITE_URL}/collections/${c.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...all.map((p) => ({ url: `${SITE_URL}/products/${p.slug}`, lastModified: p.publishedAt ? new Date(p.publishedAt) : now, changeFrequency: 'weekly' as const, priority: 0.7 })),
    { url: `${SITE_URL}/journal`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    ...(articles?.items ?? []).map((a) => ({ url: `${SITE_URL}/journal/${a.slug}`, lastModified: a.publishedAt ? new Date(a.publishedAt) : now, priority: 0.4 })),
    ...['about', 'faqs', 'refund-and-returns', 'privacy-policy'].map((s) => ({ url: `${SITE_URL}/pages/${s}`, lastModified: now, priority: 0.3 })),
  ];
}
