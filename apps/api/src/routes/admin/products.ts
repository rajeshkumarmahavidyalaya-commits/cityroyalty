import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { IMAGE_KINDS, IMAGE_SLOTS, PRODUCT_STATUSES, productInputSchema, slugify, type ProductInput } from '@cityroyalty/shared';
import type { Deps } from '../../app';
import { audit } from '../../lib/audit';
import { requireRole } from '../../lib/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { escapeRegex, idParam, parse, wrap } from '../../lib/http';
import { processImage } from '../../lib/images';
import { Asset, Order, Product, type ProductHydrated } from '../../models';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Full admin view (includes concept images and exact stock). */
export function adminProduct(p: any) {
  return {
    id: String(p._id), title: p.title, slug: p.slug, sku: p.sku, status: p.status, blockers: p.blockers, description: p.description, highlights: p.highlights,
    material: p.material ?? '', materialKey: p.materialKey ?? '', care: p.care ?? '', collections: p.collections, tags: p.tags,
    options: p.options.map((o: any) => ({ name: o.name, values: [...o.values] })),
    variants: p.variants.map((v: any) => ({
      id: String(v._id), sku: v.sku, options: v.options instanceof Map ? Object.fromEntries(v.options) : v.options, price: v.price,
      compareAtPrice: v.compareAtPrice ?? null, stock: v.stock ?? null, madeToOrder: v.madeToOrder, active: v.active,
    })),
    images: [...p.images]
      .sort((a: any, b: any) => IMAGE_SLOTS.indexOf(a.slot) - IMAGE_SLOTS.indexOf(b.slot) || (a.position ?? 0) - (b.position ?? 0))
      .map((i: any) => ({ id: String(i._id), slot: i.slot, kind: i.kind, alt: i.alt, colour: i.colour ?? '', position: i.position, width: i.width, height: i.height, src: i.src, blur: i.blur })),
    seo: { title: p.seo?.title ?? '', description: p.seo?.description ?? '', noindex: Boolean(p.seo?.noindex) },
    featured: p.featured, priceFrom: p.priceFrom, available: p.available, publishedAt: p.publishedAt?.toISOString?.() ?? null,
    provenance: p.provenance, updatedAt: p.updatedAt?.toISOString?.(), createdAt: p.createdAt?.toISOString?.(),
  };
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = base || 'product';
  for (let i = 2; await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

function applyInput(p: ProductHydrated, input: ProductInput) {
  p.title = input.title;
  p.sku = input.sku;
  p.description = input.description;
  p.highlights = input.highlights as any;
  p.material = input.material;
  p.care = input.care;
  p.collections = input.collections as any;
  p.tags = input.tags as any;
  p.options = input.options as any;
  p.featured = input.featured;
  p.seo = input.seo as any;
  const existing = new Map(p.variants.map((v) => [String(v._id), v]));
  const next: any[] = [];
  for (const v of input.variants) {
    const cur = v.id ? existing.get(v.id) : undefined;
    if (v.id && !cur) throw badRequest('Unknown variant id', { id: v.id });
    next.push({ ...(cur ? { _id: cur._id } : {}), ...v, id: undefined });
  }
  p.variants = next as any;
}

export function adminProductRoutes({ storage, revalidate }: Deps) {
  const r = Router();
  const editor = requireRole('content', 'manager', 'admin');
  const publisher = requireRole('manager', 'admin');

  r.get('/', editor, wrap(async (req, res) => {
    const { status, q, collection, page = '1' } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (status && (PRODUCT_STATUSES as readonly string[]).includes(status)) filter.status = status;
    if (collection) filter.collections = collection;
    if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), 'i') }, { sku: new RegExp(escapeRegex(q), 'i') }];
    const limit = 40;
    const pg = Math.max(1, Number(page) || 1);
    const [items, total, counts] = await Promise.all([
      Product.find(filter).sort({ updatedAt: -1 }).skip((pg - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Product.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    res.json({
      items: items.map((p: any) => ({
        id: String(p._id), title: p.title, slug: p.slug, sku: p.sku, status: p.status, blockers: p.blockers, priceFrom: p.priceFrom, available: p.available,
        image: p.images.find((i: any) => i.kind === 'photo')?.webp?.[0]?.url ?? null, collections: p.collections, updatedAt: p.updatedAt.toISOString(),
        variants: p.variants.length, stock: p.variants.reduce((s: number, v: any) => s + (v.stock ?? 0), 0),
      })),
      page: pg, pages: Math.max(1, Math.ceil(total / limit)), total,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  }));

  r.get('/:id', editor, wrap(async (req, res) => {
    const p = await Product.findById(idParam(req)).lean();
    if (!p) throw notFound('Product');
    res.json(adminProduct(p));
  }));

  r.post('/', editor, wrap(async (req, res) => {
    const input = parse(productInputSchema, req.body);
    const p = new Product({ status: 'draft', provenance: { source: 'manual' }, updatedBy: req.user!.id });
    p.slug = await uniqueSlug(input.slug ?? slugify(input.title));
    applyInput(p, input);
    await p.save();
    await audit(req, 'product.create', 'product', String(p._id), `Created draft “${p.title}”`);
    res.status(201).json(adminProduct(p.toObject()));
  }));

  r.put('/:id', editor, wrap(async (req, res) => {
    const input = parse(productInputSchema, req.body);
    const p = await Product.findById(idParam(req));
    if (!p) throw notFound('Product');
    if (input.slug && input.slug !== p.slug) p.slug = await uniqueSlug(input.slug, String(p._id));
    applyInput(p, input);
    p.updatedBy = req.user!.id as any;
    await p.save();
    // editing a live product can reintroduce blockers → pull it back to draft rather than serve bad data
    if (p.status !== 'draft' && p.status !== 'archived' && p.blockers.length) {
      p.status = 'draft';
      await p.save();
    }
    await audit(req, 'product.update', 'product', String(p._id), `Updated “${p.title}”`);
    void revalidate('products', `product:${p.slug}`);
    res.json(adminProduct(p.toObject()));
  }));

  r.post('/:id/status', editor, wrap(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(PRODUCT_STATUSES) }), req.body);
    const p = await Product.findById(idParam(req));
    if (!p) throw notFound('Product');
    const isPublisher = req.user!.role === 'manager' || req.user!.role === 'admin';
    if ((status === 'published' || status === 'archived') && !isPublisher) throw badRequest('Only managers can publish or archive', undefined, 'forbidden');
    if ((status === 'published' || status === 'review') && p.blockers.length) {
      throw conflict('This product cannot move forward yet', 'publish_blocked', { blockers: p.blockers });
    }
    if (status === 'published' && p.status === 'draft') throw conflict('Send the product to review first', 'needs_review');
    if (status === 'published' && !p.publishedAt) p.publishedAt = new Date();
    p.status = status;
    await p.save();
    await audit(req, `product.${status}`, 'product', String(p._id), `${p.title} → ${status}`);
    void revalidate('products', `product:${p.slug}`);
    res.json(adminProduct(p.toObject()));
  }));

  r.delete('/:id', publisher, wrap(async (req, res) => {
    const p = await Product.findById(idParam(req));
    if (!p) throw notFound('Product');
    if (p.status === 'published') throw conflict('Archive the product before deleting it', 'still_published');
    if (await Order.exists({ 'lines.productId': p._id })) throw conflict('This product has orders. Archive it instead.', 'has_orders');
    await p.deleteOne();
    await audit(req, 'product.delete', 'product', String(p._id), `Deleted “${p.title}”`);
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
    const p = await Product.findById(idParam(req));
    if (!p) throw notFound('Product');
    let out;
    try {
      out = await processImage(file.buffer, storage);
    } catch (e) {
      throw badRequest((e as Error).message, undefined, 'bad_image');
    }
    const asset = await Asset.findOneAndUpdate(
      { key: out.key },
      { $set: { key: out.key, originalName: file.originalname, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } },
      { upsert: true, returnDocument: 'after' },
    );
    p.images.push({ ...meta, assetId: asset._id, position: p.images.length, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } as any);
    await p.save();
    await audit(req, 'product.image_add', 'product', String(p._id), `Image (${meta.slot}, ${meta.kind}) added to “${p.title}”`);
    void revalidate(`product:${p.slug}`);
    res.status(201).json(adminProduct(p.toObject()));
  }));

  r.patch('/:id/images/:imageId', editor, wrap(async (req, res) => {
    const patch = parse(imageMeta.partial().extend({ position: z.number().int().min(0).optional() }), req.body);
    const p = await Product.findById(idParam(req));
    const img = p?.images.id(idParam(req, 'imageId'));
    if (!p || !img) throw notFound('Image');
    img.set(patch);
    await p.save();
    // a published product that loses its last verified photo must leave the storefront
    if (p.status === 'published' && p.blockers.length) {
      p.status = 'draft';
      await p.save();
    }
    void revalidate(`product:${p.slug}`);
    res.json(adminProduct(p.toObject()));
  }));

  r.delete('/:id/images/:imageId', editor, wrap(async (req, res) => {
    const p = await Product.findById(idParam(req));
    const img = p?.images.id(idParam(req, 'imageId'));
    if (!p || !img) throw notFound('Image');
    img.deleteOne();
    await p.save();
    if (p.status === 'published' && p.blockers.length) {
      p.status = 'draft';
      await p.save();
    }
    void revalidate(`product:${p.slug}`);
    res.json(adminProduct(p.toObject()));
  }));

  return r;
}

export { upload, ALLOWED };
