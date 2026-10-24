import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

export const revalidate = 3600;

const abs = (u: string) => (u.startsWith('http') ? u : `${SITE_URL}${u}`);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cols, products, articles, pages] = await Promise.all([api.collections(), api.products({ limit: 60 }), api.articles(), api.pages()]);
  const all = products?.items ?? [];
  // page through the catalogue so large catalogues are fully listed
  for (let p = 2; products && p <= products.pages; p++) all.push(...((await api.products({ limit: 60, page: p }))?.items ?? []));
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/collections/all`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...(cols?.items ?? []).map((c) => ({ url: `${SITE_URL}/collections/${c.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8, images: c.heroImage ? [abs(c.heroImage)] : undefined })),
    // image sitemap entries: product photographs only (never styling imagery)
    ...all.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      images: [p.image?.src, p.hoverImage?.src].filter((x): x is string => Boolean(x)).map(abs),
    })),
    { url: `${SITE_URL}/journal`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    ...(articles?.items ?? []).map((a) => ({ url: `${SITE_URL}/journal/${a.slug}`, lastModified: a.publishedAt ? new Date(a.publishedAt) : now, priority: 0.4 })),
    // published info pages only, so an unpublished placeholder never gets submitted
    ...(pages?.items ?? []).filter((p) => p.slug !== 'size-guide').map((p) => ({ url: `${SITE_URL}/pages/${p.slug}`, lastModified: new Date(p.updatedAt), priority: 0.3 })),
  ];
}
