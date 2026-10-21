import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_SLOTS, slugify, stripHtml, type ImageSlot } from '@cityroyalty/shared';
import { cleanHtml } from '../lib/sanitize';
import { processImage } from '../lib/images';
import type { Storage } from '../lib/storage';
import { logger } from '../logger';
import { Article, Asset, Collection, Page, Product } from '../models';

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

export function variantsFor(p: WooProduct): { options: Record<string, string> }[] {
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

const materialKey = (title: string) => (/suede/i.test(title) ? 'Suede' : undefined);

export interface ImportOptions {
  dir: string;
  storage?: Storage;
  downloadImages?: boolean;
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

export async function importWooSnapshot(opts: ImportOptions): Promise<ImportReport> {
  const log = opts.log ?? ((m: string) => logger.info(m));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const read = async <T,>(f: string) => JSON.parse(await readFile(path.join(opts.dir, f), 'utf8')) as T;
  const woo = (await read<WooProduct[]>('products.json')).slice(0, opts.limit ?? Infinity);
  const report: ImportReport = { products: woo.length, created: 0, updated: 0, collections: 0, articles: 0, pages: 0, images: 0, draftReasons: {}, ambiguous: [] };

  /* collections */
  const slugs = new Set(woo.flatMap((p) => p.categories.map((c) => c.slug)));
  for (const slug of slugs) {
    const meta = COLLECTION_META[slug] ?? { title: slug, parent: null, position: 99 };
    await Collection.updateOne({ slug }, { $set: { title: meta.title, parent: meta.parent, position: meta.position, active: true }, $setOnInsert: { slug, description: '' } }, { upsert: true });
    report.collections++;
  }

  /* products */
  const seenSlugs = new Set<string>();
  for (const w of woo) {
    const variants = variantsFor(w).map((v, i, all) => ({
      sku: all.length === 1 ? w.sku : `${w.sku}-${Object.values(v.options).map((x) => slugify(x).toUpperCase()).join('-')}`.replace(/-$/, `-${i + 1}`),
      options: v.options,
      price: w.price,
      compareAtPrice: w.regularPrice > w.price ? w.regularPrice : null,
      stock: null as number | null, // not exposed by the public Store API → unknown until entered in admin
      madeToOrder: false,
      active: true,
    }));
    const optionNames = [...new Set(variants.flatMap((v) => Object.keys(v.options)))];
    const options = optionNames.map((name) => ({ name, values: [...new Set(variants.map((v) => v.options[name]).filter((x): x is string => Boolean(x)))] }));
    if (w.type === 'simple' && w.attributes.some((a) => a.terms.length > 1)) report.ambiguous.push(`${w.sku}: simple product lists several ${w.attributes.filter((a) => a.terms.length > 1).map((a) => a.name).join('/')} values but has no variants`);
    let slug = w.slug;
    if (seenSlugs.has(slug)) slug = `${slug}-${w.wooId}`;
    seenSlugs.add(slug);

    const desc = stripHtml(w.description || w.shortDescription || '');
    const existing = await Product.findOne({ 'provenance.wooId': w.wooId });
    const doc = existing ?? new Product({ status: 'draft' });
    doc.title = w.name;
    doc.slug = existing?.slug ?? slug;
    doc.sku = w.sku;
    if (!existing || !existing.description) doc.description = desc;
    doc.collections = w.categories.map((c) => c.slug) as any;
    if (!existing) {
      doc.options = options as any;
      doc.variants = variants as any;
    } else {
      // never overwrite what a human may have edited (stock, price) — only add variants that are new
      for (const v of variants) if (!doc.variants.some((x) => x.sku === v.sku)) doc.variants.push(v as any);
    }
    doc.materialKey = materialKey(w.name);
    doc.provenance = { source: 'woocommerce', wooId: w.wooId, permalink: w.permalink, importedAt: new Date() } as any;

    if (opts.downloadImages && opts.storage && w.images.length && !doc.images.length) {
      let n = 0;
      for (const img of w.images) {
        try {
          const buf = await download(img.src, opts.cacheDir ?? '.cache/woo-images', fetchImpl);
          const out = await processImage(buf, opts.storage);
          await Asset.updateOne(
            { key: out.key },
            { $set: { key: out.key, originalName: path.basename(new URL(img.src).pathname), sourceUrl: img.src, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } },
            { upsert: true },
          );
          const asset = await Asset.findOne({ key: out.key });
          const slot: ImageSlot = IMAGE_SLOTS[n] ?? 'detail';
          doc.images.push({ slot, kind: 'photo', assetId: asset!._id, alt: `${w.name} — photo ${n + 1}`, position: n, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } as any);
          n++;
          report.images++;
        } catch (err) {
          log(`image failed ${img.src}: ${(err as Error).message}`);
        }
      }
    }
    await doc.save();
    // promote only when nothing blocks it; a human publishes
    if (doc.status === 'draft' && !doc.blockers.length) {
      doc.status = 'review';
      await doc.save();
    }
    for (const b of doc.blockers) report.draftReasons[b] = (report.draftReasons[b] ?? 0) + 1;
    existing ? report.updated++ : report.created++;
  }

  /* journal + information pages */
  try {
    const posts = await read<{ id: number; slug: string; date: string; title: { rendered: string }; excerpt: { rendered: string }; content: { rendered: string } }[]>('posts.json');
    for (const p of posts) {
      await Article.updateOne(
        { slug: p.slug },
        { $set: { title: stripHtml(p.title.rendered), excerpt: stripHtml(p.excerpt.rendered).slice(0, 280), body: cleanHtml(p.content.rendered), status: 'published', wooId: p.id }, $setOnInsert: { slug: p.slug, publishedAt: new Date(p.date) } },
        { upsert: true },
      );
      report.articles++;
    }
    const pages = await read<{ id: number; slug: string; title: { rendered: string }; content: { rendered: string } }[]>('pages.json');
    for (const pg of pages) {
      const map = PAGE_MAP[pg.slug];
      if (!map) continue;
      await Page.updateOne({ slug: map.slug }, { $set: { title: map.title, body: cleanHtml(pg.content.rendered), status: 'published', wooId: pg.id }, $setOnInsert: { slug: map.slug } }, { upsert: true });
      report.pages++;
    }
  } catch (err) {
    log(`content import skipped: ${(err as Error).message}`);
  }
  log(`imported ${report.products} products (${report.created} new, ${report.updated} updated), ${report.images} images`);
  return report;
}
