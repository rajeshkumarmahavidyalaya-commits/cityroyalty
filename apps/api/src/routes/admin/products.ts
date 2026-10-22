import { Router } from 'express';
import multer from 'multer';
import { and, desc, eq, ilike, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { IMAGE_KINDS, IMAGE_SLOTS, PRODUCT_STATUSES, productInputSchema, slugify, type ProductInput } from '@cityroyalty/shared';
import type { Deps } from '../../app';
import { db, type Tx } from '../../db';
import { assets, orderLines, productImages, products, variants } from '../../db/schema';
import { audit } from '../../lib/audit';
import { requireRole } from '../../lib/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { contains, idParam, parse, wrap } from '../../lib/http';
import { processImage } from '../../lib/images';
import { hydrate, loadProduct, refreshProduct, type FullProduct } from '../../services/products';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Full admin view (includes concept images and exact stock). */
export function adminProduct(p: FullProduct) {
  return {
    id: p.id, title: p.title, slug: p.slug, sku: p.sku, status: p.status, blockers: p.blockers, description: p.description, highlights: p.highlights,
    material: p.material ?? '', materialKey: p.materialKey ?? '', care: p.care ?? '', collections: p.collections, tags: p.tags, options: p.options,
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, options: v.options, price: v.price, compareAtPrice: v.compareAtPrice ?? null, stock: v.stock ?? null, madeToOrder: v.madeToOrder, active: v.active })),
    images: p.images.map((i) => ({ id: i.id, slot: i.slot, kind: i.kind, alt: i.alt, colour: i.colour ?? '', position: i.position, width: i.width, height: i.height, src: i.src, blur: i.blur })),
    seo: { title: p.seo.title ?? '', description: p.seo.description ?? '', noindex: Boolean(p.seo.noindex) },
    featured: p.featured, priceFrom: p.priceFrom, available: p.available, publishedAt: p.publishedAt?.toISOString() ?? null,
    provenance: p.provenance, updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt.toISOString(),
  };
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base || 'product';
  for (let i = 2; ; i++) {
    const [hit] = await db().select({ id: products.id }).from(products).where(and(eq(products.slug, slug), excludeId ? ne(products.id, excludeId) : undefined));
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
}

async function writeVariants(tx: Tx, productId: string, input: ProductInput) {
  const current = await tx.select({ id: variants.id }).from(variants).where(eq(variants.productId, productId));
  const known = new Set(current.map((v) => v.id));
  for (const v of input.variants) if (v.id && !known.has(v.id)) throw badRequest('Unknown variant id', { id: v.id });
  const keep = input.variants.filter((v) => v.id).map((v) => v.id!);
  await tx.delete(variants).where(and(eq(variants.productId, productId), keep.length ? notInArray(variants.id, keep) : undefined));
  for (const [i, v] of input.variants.entries()) {
    const values = { sku: v.sku, options: v.options, price: v.price, compareAtPrice: v.compareAtPrice ?? null, stock: v.stock, madeToOrder: v.madeToOrder, active: v.active, position: i };
    if (v.id) await tx.update(variants).set(values).where(eq(variants.id, v.id));
    else await tx.insert(variants).values({ ...values, productId });
  }
}

const fields = (input: ProductInput) => ({
  title: input.title, sku: input.sku, description: input.description, highlights: input.highlights, material: input.material ?? null, care: input.care ?? null,
  collections: input.collections, tags: input.tags, options: input.options, featured: input.featured, seo: input.seo,
});

/** A live product that gained a blocker leaves the storefront rather than serving bad data. */
async function demoteIfBlocked(p: FullProduct): Promise<FullProduct> {
  if (p.status !== 'draft' && p.status !== 'archived' && p.blockers.length) {
    await db().update(products).set({ status: 'draft' }).where(eq(products.id, p.id));
    return { ...p, status: 'draft' };
  }
  return p;
}

export function adminProductRoutes({ storage, revalidate }: Deps) {
  const r = Router();
  const editor = requireRole('content', 'manager', 'admin');
  const publisher = requireRole('manager', 'admin');

  r.get('/', editor, wrap(async (req, res) => {
    const { status, q, collection, page = '1' } = req.query as Record<string, string | undefined>;
    const conds: (SQL | undefined)[] = [];
    if (status && (PRODUCT_STATUSES as readonly string[]).includes(status)) conds.push(eq(products.status, status));
    if (collection) conds.push(sql`${collection} = any(${products.collections})`);
    if (q) conds.push(or(ilike(products.title, contains(q)), ilike(products.sku, contains(q))));
    const where = and(...conds);
    const limit = 40;
    const pg = Math.max(1, Number(page) || 1);
    const [rows, [{ n }], counts] = (await Promise.all([
      db().select().from(products).where(where).orderBy(desc(products.updatedAt)).limit(limit).offset((pg - 1) * limit),
      db().select({ n: sql<number>`count(*)::int` }).from(products).where(where),
      db().select({ status: products.status, n: sql<number>`count(*)::int` }).from(products).groupBy(products.status),
    ])) as [typeof products.$inferSelect[], [{ n: number }], { status: string; n: number }[]];
    const full = await hydrate(rows);
    res.json({
      items: full.map((p) => ({
        id: p.id, title: p.title, slug: p.slug, sku: p.sku, status: p.status, blockers: p.blockers, priceFrom: p.priceFrom, available: p.available,
        image: p.images.find((i) => i.kind === 'photo')?.webp[0]?.url ?? null, collections: p.collections, updatedAt: p.updatedAt.toISOString(),
        variants: p.variants.length, stock: p.variants.reduce((s, v) => s + (v.stock ?? 0), 0),
      })),
      page: pg, pages: Math.max(1, Math.ceil(n / limit)), total: n,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  }));

  r.get('/:id', editor, wrap(async (req, res) => {
    const p = await loadProduct(idParam(req));
    if (!p) throw notFound('Product');
    res.json(adminProduct(p));
  }));

  r.post('/', editor, wrap(async (req, res) => {
    const input = parse(productInputSchema, req.body);
    const slug = await uniqueSlug(input.slug ?? slugify(input.title));
    const id = await db().transaction(async (tx) => {
      const [row] = await tx.insert(products).values({ ...fields(input), slug, status: 'draft', provenance: { source: 'manual' }, updatedBy: req.user!.id }).returning({ id: products.id });
      await writeVariants(tx, row!.id, input);
      return row!.id;
    });
    const p = (await refreshProduct(id))!;
    await audit(req, 'product.create', 'product', id, `Created draft “${p.title}”`);
    res.status(201).json(adminProduct(p));
  }));

  r.put('/:id', editor, wrap(async (req, res) => {
    const input = parse(productInputSchema, req.body);
    const id = idParam(req);
    const before = await loadProduct(id);
    if (!before) throw notFound('Product');
    const slug = input.slug && input.slug !== before.slug ? await uniqueSlug(input.slug, id) : before.slug;
    await db().transaction(async (tx) => {
      await tx.update(products).set({ ...fields(input), slug, updatedBy: req.user!.id, updatedAt: new Date() }).where(eq(products.id, id));
      await writeVariants(tx, id, input);
    });
    const p = await demoteIfBlocked((await refreshProduct(id))!);
    await audit(req, 'product.update', 'product', id, `Updated “${p.title}”`);
    void revalidate('products', `product:${p.slug}`);
    res.json(adminProduct(p));
  }));

  r.post('/:id/status', editor, wrap(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(PRODUCT_STATUSES) }), req.body);
    const id = idParam(req);
    const p = await refreshProduct(id);
    if (!p) throw notFound('Product');
    const isPublisher = req.user!.role === 'manager' || req.user!.role === 'admin';
    if ((status === 'published' || status === 'archived') && !isPublisher) throw badRequest('Only managers can publish or archive', undefined, 'forbidden');
    if ((status === 'published' || status === 'review') && p.blockers.length) throw conflict('This product cannot move forward yet', 'publish_blocked', { blockers: p.blockers });
    if (status === 'published' && p.status === 'draft') throw conflict('Send the product to review first', 'needs_review');
    await db().update(products).set({ status, ...(status === 'published' && !p.publishedAt ? { publishedAt: new Date() } : {}), updatedAt: new Date() }).where(eq(products.id, id));
    await audit(req, `product.${status}`, 'product', id, `${p.title} → ${status}`);
    void revalidate('products', `product:${p.slug}`);
    res.json(adminProduct((await loadProduct(id))!));
  }));

  r.delete('/:id', publisher, wrap(async (req, res) => {
    const p = await loadProduct(idParam(req));
    if (!p) throw notFound('Product');
    if (p.status === 'published') throw conflict('Archive the product before deleting it', 'still_published');
    const [used] = await db().select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.productId, p.id)).limit(1);
    if (used) throw conflict('This product has orders. Archive it instead.', 'has_orders');
    await db().delete(products).where(eq(products.id, p.id));
    await audit(req, 'product.delete', 'product', p.id, `Deleted “${p.title}”`);
    void revalidate('products');
    res.json({ ok: true });
  }));

  /* ---------- images ---------- */
  const imageMeta = z.object({
    slot: z.enum(IMAGE_SLOTS),
    kind: z.enum(IMAGE_KINDS).default('photo'),
    alt: z.string().trim().min(1).max(240),
    colour: z.string().trim().max(60).optional(),
  });

  r.post('/:id/images', editor, upload.single('file'), wrap(async (req, res) => {
    const file = req.file;
    if (!file || !ALLOWED.has(file.mimetype)) throw badRequest('Upload a JPEG, PNG, WebP or AVIF image', undefined, 'bad_file');
    const meta = parse(imageMeta, req.body);
    const id = idParam(req);
    const p = await loadProduct(id);
    if (!p) throw notFound('Product');
    let out;
    try {
      out = await processImage(file.buffer, storage);
    } catch (e) {
      throw badRequest((e as Error).message, undefined, 'bad_image');
    }
    const values = { key: out.key, originalName: file.originalname, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur };
    const [asset] = await db().insert(assets).values(values).onConflictDoUpdate({ target: assets.key, set: values }).returning();
    await db().insert(productImages).values({ productId: id, ...meta, colour: meta.colour ?? null, assetId: asset!.id, position: p.images.length, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur });
    const fresh = (await refreshProduct(id))!;
    await audit(req, 'product.image_add', 'product', id, `Image (${meta.slot}, ${meta.kind}) added to “${p.title}”`);
    void revalidate(`product:${p.slug}`);
    res.status(201).json(adminProduct(fresh));
  }));

  r.patch('/:id/images/:imageId', editor, wrap(async (req, res) => {
    const patch = parse(imageMeta.partial().extend({ position: z.number().int().min(0).optional() }), req.body);
    const id = idParam(req);
    const r2 = await db().update(productImages).set(patch).where(and(eq(productImages.id, idParam(req, 'imageId')), eq(productImages.productId, id))).returning({ id: productImages.id });
    if (!r2.length) throw notFound('Image');
    // a published product that loses its last verified photo must leave the storefront
    const p = await demoteIfBlocked((await refreshProduct(id))!);
    void revalidate(`product:${p.slug}`);
    res.json(adminProduct(p));
  }));

  r.delete('/:id/images/:imageId', editor, wrap(async (req, res) => {
    const id = idParam(req);
    const r2 = await db().delete(productImages).where(and(eq(productImages.id, idParam(req, 'imageId')), eq(productImages.productId, id))).returning({ id: productImages.id });
    if (!r2.length) throw notFound('Image');
    const p = await demoteIfBlocked((await refreshProduct(id))!);
    void revalidate(`product:${p.slug}`);
    res.json(adminProduct(p));
  }));

  return r;
}

export { upload, ALLOWED };
