import 'server-only';
import type {
  ArticleDTO,
  CampaignDTO,
  CollectionDTO,
  FacetsDTO,
  Paged,
  PageDTO,
  ProductCardDTO,
  ProductDTO,
  ProductQuery,
  PublicSettingsDTO,
} from '@cityroyalty/shared';
import { API_URL } from './env';

type Tagged = { revalidate?: number; tags?: string[] };

/** Server-side fetch against the Express API. Tagged so the API can purge it via /api/revalidate. */
async function get<T>(path: string, { revalidate = 60, tags = [] }: Tagged = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate, tags } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status} ${path}`);
    return (await res.json()) as T;
  } catch (err) {
    // API unreachable at build/request time → behave as "no data" so pages degrade rather than 500
    if (process.env.NODE_ENV !== 'production') console.warn('[api]', (err as Error).message);
    return null;
  }
}

export type ProductList = Paged<ProductCardDTO> & { facets: FacetsDTO };

const qs = (q: Partial<Record<keyof ProductQuery, unknown>>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === '' || v === false) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  products: (q: Partial<Record<keyof ProductQuery, unknown>> = {}) => get<ProductList>(`/products${qs(q)}`, { tags: ['products'] }),
  product: (slug: string) => get<{ product: ProductDTO; related: ProductCardDTO[] }>(`/products/${encodeURIComponent(slug)}`, { tags: ['products', `product:${slug}`] }),
  collections: () => get<{ items: CollectionDTO[] }>('/collections', { tags: ['collections', 'products'] }),
  collection: (slug: string) => get<CollectionDTO>(`/collections/${encodeURIComponent(slug)}`, { tags: ['collections', 'products'] }),
  search: (q: string, page = 1) => get<ProductList>(`/search${qs({ q, page })}`, { revalidate: 30 }),
  articles: () => get<{ items: ArticleDTO[] }>('/articles', { tags: ['articles'] }),
  article: (slug: string) => get<ArticleDTO>(`/articles/${encodeURIComponent(slug)}`, { tags: ['articles'] }),
  page: (slug: string) => get<PageDTO>(`/pages/${encodeURIComponent(slug)}`, { tags: ['pages'] }),
  campaigns: () => get<{ items: CampaignDTO[] }>('/campaigns', { tags: ['campaigns'] }),
  settings: () => get<PublicSettingsDTO>('/settings/public', { tags: ['settings'] }),
};
