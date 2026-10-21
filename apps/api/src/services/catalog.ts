import type { QueryFilter } from 'mongoose';
import {
  IMAGE_SLOTS,
  type FacetsDTO,
  type ImageDTO,
  type Paged,
  type ProductCardDTO,
  type ProductDTO,
  type ProductQuery,
  type VariantDTO,
} from '@cityroyalty/shared';
import { escapeRegex } from '../lib/http';
import { Product, type ProductDoc } from '../models';

type Lean = ProductDoc & { _id: unknown };
type LeanImage = ProductDoc['images'][number] & { _id?: unknown };
type LeanVariant = ProductDoc['variants'][number] & { _id?: unknown };

const optionsOf = (v: LeanVariant): Record<string, string> =>
  v.options instanceof Map ? Object.fromEntries(v.options) : ((v.options as unknown as Record<string, string>) ?? {});

export function toImage(i: LeanImage): ImageDTO {
  return {
    id: String(i._id),
    slot: i.slot,
    kind: i.kind,
    alt: i.alt,
    colour: i.colour ?? undefined,
    width: i.width ?? 0,
    height: i.height ?? 0,
    src: i.src ?? '',
    avif: (i.avif ?? []).map((s) => ({ w: s.w!, url: s.url! })),
    webp: (i.webp ?? []).map((s) => ({ w: s.w!, url: s.url! })),
    blur: i.blur ?? undefined,
  };
}

/** Concept art never leaves the API on a product (docs/product-accuracy.md). */
export function publicImages(p: Pick<ProductDoc, 'images'>): ImageDTO[] {
  return (p.images ?? [])
    .filter((i) => i.kind === 'photo')
    .slice()
    .sort((a, b) => IMAGE_SLOTS.indexOf(a.slot) - IMAGE_SLOTS.indexOf(b.slot) || (a.position ?? 0) - (b.position ?? 0))
    .map(toImage);
}

export function toVariant(v: LeanVariant): VariantDTO {
  const stock = v.stock ?? 0;
  const available = v.active && v.price > 0 && (v.madeToOrder || stock > 0);
  return {
    id: String(v._id),
    sku: v.sku,
    options: optionsOf(v),
    price: v.price,
    compareAtPrice: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null,
    available,
    lowStock: !v.madeToOrder && stock > 0 && stock <= 5 ? stock : null,
    madeToOrder: v.madeToOrder,
  };
}

export function toCard(p: Lean): ProductCardDTO {
  const imgs = publicImages(p);
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    priceFrom: p.priceFrom,
    compareAtFrom: p.compareAtFrom ?? null,
    colours: p.colours,
    sizes: p.sizes,
    image: imgs[0] ?? null,
    hoverImage: imgs[1] ?? null,
    available: p.available,
    featured: p.featured,
    collections: p.collections,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  };
}

export function toProduct(p: Lean): ProductDTO {
  return {
    ...toCard(p),
    sku: p.sku,
    description: p.description,
    highlights: p.highlights,
    material: p.material ?? undefined,
    care: p.care ?? undefined,
    options: p.options.map((o) => ({ name: o.name!, values: [...o.values] })),
    variants: p.variants.filter((v) => v.active).map(toVariant),
    images: publicImages(p),
    seo: { title: p.seo?.title ?? undefined, description: p.seo?.description ?? undefined, noindex: p.seo?.noindex ?? undefined },
    updatedAt: (p as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

const SORTS: Record<ProductQuery['sort'], Record<string, 1 | -1>> = {
  featured: { featured: -1, sortOrder: 1, publishedAt: -1, _id: 1 },
  newest: { publishedAt: -1, _id: 1 },
  'price-asc': { priceFrom: 1, _id: 1 },
  'price-desc': { priceFrom: -1, _id: 1 },
  title: { title: 1, _id: 1 },
};

export function buildFilter(q: ProductQuery, collectionSlugs?: string[]): QueryFilter<ProductDoc> {
  const f: QueryFilter<ProductDoc> = { status: 'published' };
  if (collectionSlugs?.length) f.collections = { $in: collectionSlugs };
  if (q.q) {
    const tokens = q.q.split(/\s+/).filter(Boolean).slice(0, 5);
    f.$and = tokens.map((t) => {
      const re = new RegExp(escapeRegex(t), 'i');
      return { $or: [{ title: re }, { sku: re }, { tags: re }, { colours: re }, { collections: re }] };
    });
  }
  if (q.size.length) f.sizes = { $in: q.size };
  if (q.colour.length) f.colours = { $in: q.colour };
  if (q.material.length) f.materialKey = { $in: q.material };
  if (q.minPrice != null || q.maxPrice != null) {
    f.priceFrom = { ...(q.minPrice != null && { $gte: q.minPrice }), ...(q.maxPrice != null && { $lte: q.maxPrice }) };
  }
  if (q.inStock) f.available = true;
  if (q.featured) f.featured = true;
  return f;
}

export async function listProducts(q: ProductQuery, collectionSlugs?: string[]): Promise<Paged<ProductCardDTO> & { facets: FacetsDTO }> {
  const filter = buildFilter(q, collectionSlugs);
  const base = buildFilter({ ...q, size: [], colour: [], material: [], minPrice: undefined, maxPrice: undefined, inStock: false }, collectionSlugs);
  const [total, docs, facetDocs] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select('-variants.wooId -description')
      .lean(),
    Product.find(base).select('sizes colours materialKey priceFrom').lean(),
  ]);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const prices = facetDocs.map((d) => d.priceFrom).filter((n) => n > 0);
  return {
    items: docs.map((d) => toCard(d as unknown as Lean)),
    page: q.page,
    limit: q.limit,
    total,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    facets: {
      sizes: uniq(facetDocs.flatMap((d) => d.sizes)),
      colours: uniq(facetDocs.flatMap((d) => d.colours)).sort(),
      materials: uniq(facetDocs.map((d) => d.materialKey)).sort(),
      price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    },
  };
}
