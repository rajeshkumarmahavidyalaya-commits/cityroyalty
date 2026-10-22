import { asc, eq, inArray } from 'drizzle-orm';
import { IMAGE_SLOTS } from '@cityroyalty/shared';
import { db, type DbOrTx } from '../db';
import { productImages, products, variants, type ImageRow, type ProductRow, type VariantRow } from '../db/schema';

export type FullProduct = ProductRow & { variants: VariantRow[]; images: ImageRow[] };

const isColourOption = (n: string) => /^colou?r$/i.test(n);
const isSizeOption = (n: string) => /^size$/i.test(n);

export function computeBlockers(p: { images: Pick<ImageRow, 'kind'>[]; variants: Pick<VariantRow, 'active' | 'price' | 'stock' | 'madeToOrder'>[]; collections: string[] }): string[] {
  const out: string[] = [];
  const photos = p.images.filter((i) => i.kind === 'photo');
  if (!photos.length) out.push(p.images.length ? 'Only concept images — a verified photograph is required' : 'No product photograph');
  const active = p.variants.filter((v) => v.active);
  if (!active.length) out.push('No active variants');
  if (active.some((v) => !(v.price > 0))) out.push('Price missing on an active variant');
  if (active.some((v) => v.stock == null && !v.madeToOrder)) out.push('Stock not entered (or mark made-to-order)');
  if (!p.collections.length) out.push('Not assigned to a collection');
  return out;
}

/** Derived columns used for listing/filtering and the publication gate. */
export function derive(p: Pick<FullProduct, 'variants' | 'images' | 'collections' | 'options'>) {
  const active = p.variants.filter((v) => v.active);
  const priced = active.filter((v) => v.price > 0);
  const min = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const sizes = new Set<string>();
  const colours = new Set<string>();
  for (const v of active)
    for (const [k, val] of Object.entries(v.options)) {
      if (isSizeOption(k)) sizes.add(val);
      if (isColourOption(k)) colours.add(val);
    }
  for (const o of p.options) {
    if (isSizeOption(o.name)) o.values.forEach((v) => sizes.add(v));
    if (isColourOption(o.name)) o.values.forEach((v) => colours.add(v));
  }
  return {
    priceFrom: min?.price ?? 0,
    compareAtFrom: min?.compareAtPrice && min.compareAtPrice > min.price ? min.compareAtPrice : null,
    available: active.some((v) => v.price > 0 && (v.madeToOrder || (v.stock ?? 0) > 0)),
    sizes: [...sizes],
    colours: [...colours],
    blockers: computeBlockers(p),
  };
}

const slotRank = (s: string) => IMAGE_SLOTS.indexOf(s as (typeof IMAGE_SLOTS)[number]);
export const sortImages = (xs: ImageRow[]) => [...xs].sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.position - b.position);

/** Products with their variants and images, in the order of `rows`. */
export async function hydrate(rows: ProductRow[], tx: DbOrTx = db()): Promise<FullProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [vs, is] = await Promise.all([
    tx.select().from(variants).where(inArray(variants.productId, ids)).orderBy(asc(variants.position)),
    tx.select().from(productImages).where(inArray(productImages.productId, ids)),
  ]);
  return rows.map((r) => ({ ...r, variants: vs.filter((v) => v.productId === r.id), images: sortImages(is.filter((i) => i.productId === r.id)) }));
}

export async function loadProduct(id: string, tx: DbOrTx = db()): Promise<FullProduct | null> {
  const [row] = await tx.select().from(products).where(eq(products.id, id));
  return row ? ((await hydrate([row], tx))[0] ?? null) : null;
}

/** Recompute the derived columns from the current variants/images. Returns the fresh product. */
export async function refreshProduct(id: string, tx: DbOrTx = db()): Promise<FullProduct | null> {
  const p = await loadProduct(id, tx);
  if (!p) return null;
  const d = derive(p);
  await tx.update(products).set({ ...d, updatedAt: new Date() }).where(eq(products.id, id));
  return { ...p, ...d };
}
