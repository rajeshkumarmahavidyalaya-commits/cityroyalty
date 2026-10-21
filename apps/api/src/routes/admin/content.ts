import { Router } from 'express';
import { z } from 'zod';
import { articleInputSchema, campaignInputSchema, collectionInputSchema, settingsSchema, signupSchema, slugify, ROLES } from '@cityroyalty/shared';
import multer from 'multer';
import type { Deps } from '../../app';
import { audit } from '../../lib/audit';
import { hashPassword, requireRole } from '../../lib/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { idParam, parse, wrap } from '../../lib/http';
import { processImage } from '../../lib/images';
import { cleanHtml } from '../../lib/sanitize';
import { getSettings, saveSettings } from '../../lib/settings';
import { Article, AuditLog, Asset, Campaign, Collection, Order, Page, Product, User } from '../../models';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

export function adminContentRoutes({ storage, revalidate }: Deps) {
  const r = Router();
  const editor = requireRole('content', 'manager', 'admin');
  const mgr = requireRole('manager', 'admin');
  const admin = requireRole('admin');

  /* ---------- generic image upload (hero/editorial/article/collection art) ---------- */
  r.post('/uploads', editor, upload.single('file'), wrap(async (req, res) => {
    const f = req.file;
    if (!f || !/^image\/(jpeg|png|webp|avif)$/.test(f.mimetype)) throw badRequest('Upload a JPEG, PNG, WebP or AVIF image', undefined, 'bad_file');
    let out;
    try {
      out = await processImage(f.buffer, storage);
    } catch (e) {
      throw badRequest((e as Error).message, undefined, 'bad_image');
    }
    await Asset.findOneAndUpdate({ key: out.key }, { $set: { key: out.key, originalName: f.originalname, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } }, { upsert: true });
    res.status(201).json({ url: out.src, width: out.width, height: out.height });
  }));
  r.get('/assets', editor, wrap(async (_req, res) => {
    const items = await Asset.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ items: items.map((a) => ({ id: String(a._id), src: a.src, width: a.width, height: a.height, bytes: a.bytes, name: a.originalName ?? null, sourceUrl: a.sourceUrl ?? null })) });
  }));

  /* ---------- collections ---------- */
  r.get('/collections', editor, wrap(async (_req, res) => {
    const cols = await Collection.find().sort({ position: 1, title: 1 }).lean();
    const counts = await Product.aggregate([{ $unwind: '$collections' }, { $group: { _id: { c: '$collections', s: '$status' }, n: { $sum: 1 } } }]);
    res.json({
      items: cols.map((c) => ({
        id: String(c._id), title: c.title, slug: c.slug, parent: c.parent ?? null, description: c.description, heroImage: c.heroImage ?? null, active: c.active, position: c.position, seo: c.seo ?? {},
        products: counts.filter((x) => x._id.c === c.slug).reduce((s, x) => s + x.n, 0),
        published: counts.filter((x) => x._id.c === c.slug && x._id.s === 'published').reduce((s, x) => s + x.n, 0),
      })),
    });
  }));
  r.post('/collections', mgr, wrap(async (req, res) => {
    const d = parse(collectionInputSchema, req.body);
    const slug = d.slug ?? slugify(d.title);
    if (await Collection.exists({ slug })) throw conflict('A collection with this slug exists', 'duplicate');
    const c = await Collection.create({ ...d, slug });
    await audit(req, 'collection.create', 'collection', String(c._id), c.title);
    void revalidate('collections');
    res.status(201).json({ id: String(c._id) });
  }));
  r.put('/collections/:id', mgr, wrap(async (req, res) => {
    const d = parse(collectionInputSchema, req.body);
    const c = await Collection.findByIdAndUpdate(idParam(req), { $set: { ...d, ...(d.slug ? {} : {}) } }, { returnDocument: 'after' });
    if (!c) throw notFound('Collection');
    await audit(req, 'collection.update', 'collection', String(c._id), c.title);
    void revalidate('collections', 'products');
    res.json({ id: String(c._id) });
  }));
  r.delete('/collections/:id', admin, wrap(async (req, res) => {
    const c = await Collection.findById(idParam(req));
    if (!c) throw notFound('Collection');
    if (await Product.exists({ collections: c.slug })) throw conflict('Remove products from this collection first', 'not_empty');
    await c.deleteOne();
    await audit(req, 'collection.delete', 'collection', String(c._id), c.title);
    void revalidate('collections');
    res.json({ ok: true });
  }));

  /* ---------- journal ---------- */
  r.get('/articles', editor, wrap(async (_req, res) => {
    const items = await Article.find().sort({ updatedAt: -1 }).lean();
    res.json({ items: items.map((a) => ({ id: String(a._id), title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body, coverImage: a.coverImage ?? null, tags: a.tags, status: a.status, publishedAt: a.publishedAt?.toISOString() ?? null, seo: a.seo ?? {} })) });
  }));
  r.post('/articles', editor, wrap(async (req, res) => {
    const d = parse(articleInputSchema, req.body);
    const slug = d.slug ?? slugify(d.title);
    if (await Article.exists({ slug })) throw conflict('An article with this slug exists', 'duplicate');
    const a = await Article.create({ ...d, body: cleanHtml(d.body), slug, publishedAt: d.status === 'published' ? new Date() : undefined });
    await audit(req, 'article.create', 'article', String(a._id), a.title);
    void revalidate('articles');
    res.status(201).json({ id: String(a._id) });
  }));
  r.put('/articles/:id', editor, wrap(async (req, res) => {
    const d = parse(articleInputSchema, req.body);
    const a = await Article.findById(idParam(req));
    if (!a) throw notFound('Article');
    if (d.slug) a.slug = d.slug;
    a.set({ ...d, body: cleanHtml(d.body), slug: a.slug });
    if (d.status === 'published' && !a.publishedAt) a.publishedAt = new Date();
    await a.save();
    await audit(req, 'article.update', 'article', String(a._id), a.title);
    void revalidate('articles');
    res.json({ id: String(a._id) });
  }));
  r.delete('/articles/:id', mgr, wrap(async (req, res) => {
    const a = await Article.findByIdAndDelete(idParam(req));
    if (a) await audit(req, 'article.delete', 'article', String(a._id), a.title);
    void revalidate('articles');
    res.json({ ok: true });
  }));

  /* ---------- information pages ---------- */
  r.get('/pages', editor, wrap(async (_req, res) => {
    const items = await Page.find().sort({ title: 1 }).lean();
    res.json({ items: items.map((p) => ({ id: String(p._id), slug: p.slug, title: p.title, body: p.body, status: p.status, seo: p.seo ?? {} })) });
  }));
  r.put('/pages/:id', editor, wrap(async (req, res) => {
    const d = parse(z.object({ title: z.string().min(1).max(120), body: z.string().max(60000), status: z.enum(['draft', 'published']) }), req.body);
    const p = await Page.findByIdAndUpdate(idParam(req), { $set: { ...d, body: cleanHtml(d.body) } }, { returnDocument: 'after' });
    if (!p) throw notFound('Page');
    await audit(req, 'page.update', 'page', String(p._id), p.title);
    void revalidate('pages');
    res.json({ id: String(p._id) });
  }));

  /* ---------- homepage campaigns ---------- */
  r.get('/campaigns', editor, wrap(async (_req, res) => {
    res.json({ items: (await Campaign.find().lean()).map((c) => ({ ...c, id: String(c._id) })) });
  }));
  r.put('/campaigns', editor, wrap(async (req, res) => {
    const d = parse(campaignInputSchema, req.body);
    const c = await Campaign.findOneAndUpdate({ key: d.key }, { $set: d }, { upsert: true, returnDocument: 'after' });
    await audit(req, 'campaign.update', 'campaign', String(c._id), d.key);
    void revalidate('campaigns');
    res.json({ id: String(c._id) });
  }));

  /* ---------- settings ---------- */
  r.get('/settings', admin, wrap(async (_req, res) => res.json(await getSettings())));
  r.put('/settings', admin, wrap(async (req, res) => {
    const d = parse(settingsSchema, req.body);
    await saveSettings(d);
    await audit(req, 'settings.update', 'settings', 'site', 'Site settings updated');
    void revalidate('settings');
    res.json(d);
  }));

  /* ---------- staff ---------- */
  r.get('/staff', admin, wrap(async (_req, res) => {
    const items = await User.find({ role: { $ne: 'customer' } }).sort({ createdAt: 1 }).lean();
    res.json({ items: items.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, lastLoginAt: u.lastLoginAt?.toISOString() ?? null })) });
  }));
  r.post('/staff', admin, wrap(async (req, res) => {
    const d = parse(signupSchema.extend({ role: z.enum(ROLES).exclude(['customer']) }), req.body);
    if (await User.exists({ email: d.email })) throw conflict('That email is already registered', 'email_taken');
    const u = await User.create({ name: d.name, email: d.email, role: d.role, passwordHash: await hashPassword(d.password) });
    await audit(req, 'staff.create', 'user', String(u._id), `${u.email} as ${u.role}`);
    res.status(201).json({ id: String(u._id) });
  }));
  r.patch('/staff/:id', admin, wrap(async (req, res) => {
    const d = parse(z.object({ role: z.enum(ROLES) }), req.body);
    if (idParam(req) === req.user!.id) throw conflict('You cannot change your own role', 'self_change');
    const u = await User.findByIdAndUpdate(idParam(req), { $set: { role: d.role }, $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
    if (!u) throw notFound('User');
    await audit(req, 'staff.role', 'user', String(u._id), `${u.email} → ${d.role}`);
    res.json({ ok: true });
  }));

  /* ---------- audit log ---------- */
  r.get('/audit', admin, wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean();
    res.json({ items: items.map((a) => ({ id: String(a._id), at: (a as any).createdAt.toISOString(), actor: a.actorEmail ?? 'system', action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary })) });
  }));

  /* ---------- reports ---------- */
  r.get('/reports/summary', mgr, wrap(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const paid = { status: { $in: ['paid', 'processing', 'shipped', 'delivered'] }, createdAt: { $gte: since } };
    const [totals, byDay, top, byStatus, lowStock, unknownStock] = await Promise.all([
      Order.aggregate([{ $match: paid }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 }, discounts: { $sum: '$discountTotal' } } }]),
      Order.aggregate([{ $match: paid }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Order.aggregate([{ $match: paid }, { $unwind: '$lines' }, { $group: { _id: '$lines.title', units: { $sum: '$lines.qty' }, revenue: { $sum: '$lines.lineTotal' } } }, { $sort: { units: -1 } }, { $limit: 10 }]),
      Order.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Product.countDocuments({ status: 'published', variants: { $elemMatch: { active: true, madeToOrder: false, stock: { $lte: 3, $gte: 0 } } } }),
      Product.countDocuments({ variants: { $elemMatch: { active: true, madeToOrder: false, stock: null } } }),
    ]);
    const t = totals[0] ?? { revenue: 0, orders: 0, discounts: 0 };
    res.json({
      days, revenue: t.revenue, orders: t.orders, discounts: t.discounts, aov: t.orders ? Math.round(t.revenue / t.orders) : 0,
      byDay: byDay.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
      topProducts: top.map((x) => ({ title: x._id, units: x.units, revenue: x.revenue })),
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      lowStockProducts: lowStock, productsWithUnknownStock: unknownStock,
    });
  }));

  return r;
}
