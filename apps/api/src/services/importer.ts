import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { IMAGE_SLOTS, slugify, stripHtml, type ImageSlot } from '@cityroyalty/shared';
import { db } from '../db';
import { articles, assets, collections, pages, productImages, products, variants } from '../db/schema';
import { cleanHtml } from '../lib/sanitize';
import { fromManifest, processImage, type MediaManifestEntry } from '../lib/images';
import type { Storage } from '../lib/storage';
import { logger } from '../logger';
import { refreshProduct } from './products';

interface WooProduct {
  wooId: number;
  sku: string;
  name: string;
  slug: string;
  permalink: string;
  type: 'simple' | 'variable';
  shortDescription: string;
  description: string;
  price: number;
  regularPrice: number;
  salePrice: number;
  images: { wooId: number; src: string; alt: string; name: string }[];
  categories: { id: number; slug: string; name: string }[];
  attributes: { name: string; terms: string[]; hasVariations: boolean }[];
  variations: { wooId: number; attributes: Record<string, string> }[];
}

const COLLECTION_META: Record<string, { title: string; parent: string | null; position: number }> = {
  jacket: { title: 'Leather Jackets', parent: null, position: 1 },
  'mens-jacket': { title: "Men's Leather Jackets", parent: 'jacket', position: 2 },
  'womens-jacket': { title: "Women's Leather Jackets", parent: 'jacket', position: 3 },
  'leather-bags': { title: 'Leather Bags', parent: null, position: 4 },
  belts: { title: 'Belts', parent: null, position: 5 },
  'leather-wallet': { title: 'Wallets', parent: null, position: 6 },
  jewellery: { title: 'Jewellery', parent: null, position: 7 },
};

const PAGE_MAP: Record<string, { slug: string; title: string }> = {
  'about-us-2': { slug: 'about', title: 'About City Royalty' },
  refund_returns: { slug: 'refund-and-returns', title: 'Refund and Returns Policy' },
  'privacy-policy': { slug: 'privacy-policy', title: 'Privacy Policy' },
  faqs: { slug: 'faqs', title: 'Frequently Asked Questions' },
};

export function variantsFor(p: Pick<WooProduct, 'type' | 'attributes' | 'variations'>): { options: Record<string, string> }[] {
  const termBySlug = new Map<string, string>();
  for (const a of p.attributes) for (const t of a.terms) termBySlug.set(`${a.name}:${slugify(t)}`, t);
  // attributes with exactly one term are fixed properties of the product, not choices
  const fixed: Record<string, string> = {};
  for (const a of p.attributes) if (a.terms.length === 1) fixed[a.name] = a.terms[0]!;
  const seen = new Set<string>();
  const out: { options: Record<string, string> }[] = [];
  const push = (options: Record<string, string>) => {
    const key = JSON.stringify(Object.entries(options).sort());
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ options });
    }
  };
  if (p.type === 'variable' && p.variations.length) {
    for (const v of p.variations) {
      const opts: Record<string, string> = { ...fixed };
      for (const [name, val] of Object.entries(v.attributes)) if (val) opts[name] = termBySlug.get(`${name}:${val}`) ?? val;
      push(opts);
    }
  } else push({ ...fixed });
  return out;
}

const materialKey = (title: string) => (/suede/i.test(title) ? 'Suede' : null);

export interface ImportOptions {
  dir: string;
  storage?: Storage;
  downloadImages?: boolean;
  /** Woo image URL → an image already uploaded to `storage`; used instead of downloading and re-encoding. */
  mediaManifest?: Record<string, MediaManifestEntry>;
  limit?: number;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}
export interface ImportReport {
  products: number;
  created: number;
  updated: number;
  collections: number;
  articles: number;
  pages: number;
  images: number;
  draftReasons: Record<string, number>;
  ambiguous: string[];
}

async function download(url: string, cacheDir: string, fetchImpl: typeof fetch): Promise<Buffer> {
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, createHash('sha1').update(url).digest('hex') + path.extname(new URL(url).pathname));
  try {
    return await readFile(file);
  } catch {
    /* not cached */
  }
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

/** The snapshot shipped with the API (works from src/, the dist/ bundle and a Vercel Function). */
export function snapshotDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, '../../data/woo-snapshot'), path.join(here, '../data/woo-snapshot'), path.join(process.cwd(), 'data/woo-snapshot'), path.join(process.cwd(), 'apps/api/data/woo-snapshot')];
  const dir = candidates.find((c) => existsSync(path.join(c, 'products.json')));
  if (!dir) throw new Error('WooCommerce snapshot not found');
  return dir;
}

/** The pre-processed media manifest next to the snapshot, if one was exported. */
export async function loadMediaManifest(dir: string): Promise<Record<string, MediaManifestEntry> | undefined> {
  const file = path.join(dir, 'media-manifest.json');
  return existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as Record<string, MediaManifestEntry>) : undefined;
}

export async function importWooSnapshot(opts: ImportOptions): Promise<ImportReport> {
  const log = opts.log ?? ((m: string) => logger.info(m));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const read = async <T,>(f: string) => JSON.parse(await readFile(path.join(opts.dir, f), 'utf8')) as T;
  const woo = (await read<WooProduct[]>('products.json')).slice(0, opts.limit ?? Infinity);
  const report: ImportReport = { products: woo.length, created: 0, updated: 0, collections: 0, articles: 0, pages: 0, images: 0, draftReasons: {}, ambiguous: [] };

  /* collections */
  for (const slug of new Set(woo.flatMap((p) => p.categories.map((c) => c.slug)))) {
    const meta = COLLECTION_META[slug] ?? { title: slug, parent: null, position: 99 };
    await db()
      .insert(collections)
      .values({ slug, title: meta.title, parent: meta.parent, position: meta.position, active: true })
      .onConflictDoUpdate({ target: collections.slug, set: { title: meta.title, parent: meta.parent, position: meta.position, active: true } });
    report.collections++;
  }

  /* products */
  const seenSlugs = new Set<string>();
  for (const w of woo) {
    const vs = variantsFor(w).map((v, i, all) => ({
      sku: all.length === 1 ? w.sku : `${w.sku}-${Object.values(v.options).map((x) => slugify(x).toUpperCase()).join('-')}`.replace(/-$/, `-${i + 1}`),
      options: v.options,
      price: w.price,
      compareAtPrice: w.regularPrice > w.price ? w.regularPrice : null,
      stock: null as number | null, // not exposed by the public Store API → unknown until entered in admin
      madeToOrder: false,
      active: true,
      position: i,
    }));
    const optionNames = [...new Set(vs.flatMap((v) => Object.keys(v.options)))];
    const options = optionNames.map((name) => ({ name, values: [...new Set(vs.map((v) => v.options[name]).filter((x): x is string => Boolean(x)))] }));
    if (w.type === 'simple' && w.attributes.some((a) => a.terms.length > 1))
      report.ambiguous.push(`${w.sku}: simple product lists several ${w.attributes.filter((a) => a.terms.length > 1).map((a) => a.name).join('/')} values but has no variants`);
    let slug = w.slug;
    if (seenSlugs.has(slug)) slug = `${slug}-${w.wooId}`;
    seenSlugs.add(slug);
    const desc = stripHtml(w.description || w.shortDescription || '');
    const provenance = { source: 'woocommerce' as const, wooId: w.wooId, permalink: w.permalink, importedAt: new Date().toISOString() };

    const [existing] = await db().select().from(products).where(eq(products.wooId, w.wooId));
    let productId: string;
    if (!existing) {
      const [row] = await db()
        .insert(products)
        .values({ title: w.name, slug, sku: w.sku, description: desc, collections: w.categories.map((c) => c.slug), options, materialKey: materialKey(w.name), provenance, wooId: w.wooId })
        .returning();
      productId = row!.id;
      await db().insert(variants).values(vs.map((v) => ({ ...v, productId })));
      report.created++;
    } else {
      // never overwrite what a human may have edited (stock, price, description) — only add new variants
      productId = existing.id;
      await db()
        .update(products)
        .set({ title: w.name, sku: w.sku, collections: w.categories.map((c) => c.slug), materialKey: materialKey(w.name), provenance, ...(existing.description ? {} : { description: desc }) })
        .where(eq(products.id, productId));
      const have = new Set((await db().select({ sku: variants.sku }).from(variants).where(eq(variants.productId, productId))).map((v) => v.sku));
      const fresh = vs.filter((v) => !have.has(v.sku));
      if (fresh.length) await db().insert(variants).values(fresh.map((v) => ({ ...v, productId })));
      report.updated++;
    }

    const hasImages = (await db().select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)).limit(1)).length > 0;
    if ((opts.downloadImages || opts.mediaManifest) && opts.storage && w.images.length && !hasImages) {
      let n = 0;
      for (const img of w.images) {
        try {
          const pre = opts.mediaManifest?.[img.src];
          if (!pre && !opts.downloadImages) continue;
          const out = pre ? fromManifest(pre, opts.storage) : await processImage(await download(img.src, opts.cacheDir ?? '.cache/woo-images', fetchImpl), opts.storage);
          const values = { key: out.key, originalName: path.basename(new URL(img.src).pathname), sourceUrl: img.src, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur };
          const [asset] = await db().insert(assets).values(values).onConflictDoUpdate({ target: assets.key, set: values }).returning();
          const slot: ImageSlot = IMAGE_SLOTS[n] ?? 'detail';
          await db()
            .insert(productImages)
            .values({ productId, slot, kind: 'photo', assetId: asset!.id, alt: `${w.name} — photo ${n + 1}`, position: n, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur });
          n++;
          report.images++;
        } catch (err) {
          log(`image failed ${img.src}: ${(err as Error).message}`);
        }
      }
    }

    const p = (await refreshProduct(productId))!;
    // promote only when nothing blocks it; a human publishes
    if (p.status === 'draft' && !p.blockers.length) await db().update(products).set({ status: 'review' }).where(eq(products.id, productId));
    for (const b of p.blockers) report.draftReasons[b] = (report.draftReasons[b] ?? 0) + 1;
  }

  /* journal + information pages */
  try {
    const posts = await read<{ id: number; slug: string; date: string; title: { rendered: string }; excerpt: { rendered: string }; content: { rendered: string } }[]>('posts.json');
    for (const p of posts) {
      const values = { title: stripHtml(p.title.rendered), excerpt: stripHtml(p.excerpt.rendered).slice(0, 280), body: cleanHtml(p.content.rendered), status: 'published', wooId: p.id };
      await db().insert(articles).values({ ...values, slug: p.slug, publishedAt: new Date(p.date) }).onConflictDoUpdate({ target: articles.slug, set: values });
      report.articles++;
    }
    const pg = await read<{ id: number; slug: string; title: { rendered: string }; content: { rendered: string } }[]>('pages.json');
    for (const x of pg) {
      const map = PAGE_MAP[x.slug];
      if (!map) continue;
      const values = { title: map.title, body: cleanHtml(x.content.rendered), status: 'published', wooId: x.id };
      await db().insert(pages).values({ ...values, slug: map.slug }).onConflictDoUpdate({ target: pages.slug, set: values });
      report.pages++;
    }
  } catch (err) {
    log(`content import skipped: ${(err as Error).message}`);
  }
  log(`imported ${report.products} products (${report.created} new, ${report.updated} updated), ${report.images} images`);
  return report;
}
