import { and, arrayOverlaps, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { FacetsDTO, ImageDTO, Paged, ProductCardDTO, ProductDTO, ProductQuery, VariantDTO } from '@cityroyalty/shared';
import { db } from '../db';
import { products, type ImageRow, type VariantRow } from '../db/schema';
import { hydrate, type FullProduct } from './products';

export function toImage(i: ImageRow): ImageDTO {
  return {
    id: i.id,
    slot: i.slot as ImageDTO['slot'],
    kind: i.kind as ImageDTO['kind'],
    alt: i.alt,
    colour: i.colour ?? undefined,
    width: i.width ?? 0,
    height: i.height ?? 0,
    src: i.src ?? '',
    avif: i.avif,
    webp: i.webp,
    blur: i.blur ?? undefined,
  };
}

/** Concept art never leaves the API on a product (docs/product-accuracy.md). */
export const publicImages = (p: Pick<FullProduct, 'images'>): ImageDTO[] => p.images.filter((i) => i.kind === 'photo').map(toImage);
/** Concept images: served separately so the storefront can label them; they never enter the product gallery. */
export const stylingImages = (p: Pick<FullProduct, 'images'>): ImageDTO[] => p.images.filter((i) => i.kind === 'concept').map(toImage);

export function toVariant(v: VariantRow): VariantDTO {
  const stock = v.stock ?? 0;
  return {
    id: v.id,
    sku: v.sku,
    options: v.options,
    price: v.price,
    compareAtPrice: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null,
    available: v.active && v.price > 0 && (v.madeToOrder || stock > 0),
    lowStock: !v.madeToOrder && stock > 0 && stock <= 5 ? stock : null,
    madeToOrder: v.madeToOrder,
  };
}

export function toCard(p: FullProduct): ProductCardDTO {
  const imgs = publicImages(p);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    priceFrom: p.priceFrom,
    compareAtFrom: p.compareAtFrom ?? null,
    colours: p.colours,
    sizes: p.sizes,
    image: imgs[0] ?? null,
    hoverImage: imgs[1] ?? null,
    styledImage: stylingImages(p)[0] ?? null,
    available: p.available,
    featured: p.featured,
    collections: p.collections,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  };
}

export function toProduct(p: FullProduct): ProductDTO {
  return {
    ...toCard(p),
    sku: p.sku,
    description: p.description,
    highlights: p.highlights,
    material: p.material ?? undefined,
    care: p.care ?? undefined,
    options: p.options,
    variants: p.variants.filter((v) => v.active).map(toVariant),
    images: publicImages(p),
    styling: stylingImages(p),
    seo: { title: p.seo.title || undefined, description: p.seo.description || undefined, noindex: p.seo.noindex || undefined },
    updatedAt: p.updatedAt.toISOString(),
  };
}

const SORTS: Record<ProductQuery['sort'], SQL[]> = {
  featured: [desc(products.featured), asc(products.sortOrder), sql`${products.publishedAt} desc nulls last`, asc(products.id)],
  newest: [sql`${products.publishedAt} desc nulls last`, asc(products.id)],
  'price-asc': [asc(products.priceFrom), asc(products.id)],
  'price-desc': [desc(products.priceFrom), asc(products.id)],
  title: [asc(products.title), asc(products.id)],
};

/** ILIKE pattern with %, _ and \ escaped so user input is matched literally. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export function buildFilter(q: ProductQuery, collectionSlugs?: string[]): SQL {
  const parts: (SQL | undefined)[] = [eq(products.status, 'published')];
  if (collectionSlugs?.length) parts.push(arrayOverlaps(products.collections, collectionSlugs));
  if (q.q) {
    for (const token of q.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      const like = `%${likeEscape(token)}%`;
      parts.push(
        or(
          ilike(products.title, like),
          ilike(products.sku, like),
          sql`array_to_string(${products.tags}, ' ') ilike ${like}`,
          sql`array_to_string(${products.colours}, ' ') ilike ${like}`,
          sql`array_to_string(${products.collections}, ' ') ilike ${like}`,
        ),
      );
    }
  }
  if (q.size.length) parts.push(arrayOverlaps(products.sizes, q.size));
  if (q.colour.length) parts.push(arrayOverlaps(products.colours, q.colour));
  if (q.material.length) parts.push(inArray(products.materialKey, q.material));
  if (q.minPrice != null) parts.push(gte(products.priceFrom, q.minPrice));
  if (q.maxPrice != null) parts.push(lte(products.priceFrom, q.maxPrice));
  if (q.inStock) parts.push(eq(products.available, true));
  if (q.featured) parts.push(eq(products.featured, true));
  return and(...parts)!;
}

export async function listProducts(q: ProductQuery, collectionSlugs?: string[]): Promise<Paged<ProductCardDTO> & { facets: FacetsDTO }> {
  const where = buildFilter(q, collectionSlugs);
  const base = buildFilter({ ...q, size: [], colour: [], material: [], minPrice: undefined, maxPrice: undefined, inStock: false }, collectionSlugs);
  const [[{ n }], rows, facetRows] = await Promise.all([
    db().select({ n: sql<number>`count(*)::int` }).from(products).where(where),
    db().select().from(products).where(where).orderBy(...SORTS[q.sort]).limit(q.limit).offset((q.page - 1) * q.limit),
    db().select({ sizes: products.sizes, colours: products.colours, materialKey: products.materialKey, priceFrom: products.priceFrom }).from(products).where(base),
  ]) as [[{ n: number }], typeof products.$inferSelect[], { sizes: string[]; colours: string[]; materialKey: string | null; priceFrom: number }[]];
  const full = await hydrate(rows);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const prices = facetRows.map((d) => d.priceFrom).filter((x) => x > 0);
  return {
    items: full.map(toCard),
    page: q.page,
    limit: q.limit,
    total: n,
    pages: Math.max(1, Math.ceil(n / q.limit)),
    facets: {
      sizes: uniq(facetRows.flatMap((d) => d.sizes)),
      colours: uniq(facetRows.flatMap((d) => d.colours)).sort(),
      materials: uniq(facetRows.map((d) => d.materialKey)).sort(),
      price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    },
  };
}
