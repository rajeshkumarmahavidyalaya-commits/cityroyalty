import { Router } from 'express';
import multer from 'multer';
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { articleInputSchema, campaignInputSchema, collectionInputSchema, settingsSchema, signupSchema, slugify, ROLES } from '@cityroyalty/shared';
import type { Deps } from '../../app';
import { db } from '../../db';
import { articles, assets, auditLogs, campaigns, collections, orderLines, orders, pages, products, users, variants } from '../../db/schema';
import { audit } from '../../lib/audit';
import { hashPassword, requireRole } from '../../lib/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { idParam, parse, wrap } from '../../lib/http';
import { processImage } from '../../lib/images';
import { cleanHtml } from '../../lib/sanitize';
import { getSettings, saveSettings } from '../../lib/settings';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const PAID = ['paid', 'processing', 'shipped', 'delivered'];

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
    const values = { key: out.key, originalName: f.originalname, width: out.width, height: out.height, bytes: out.bytes, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur };
    await db().insert(assets).values(values).onConflictDoUpdate({ target: assets.key, set: values });
    res.status(201).json({ url: out.src, width: out.width, height: out.height });
  }));
  r.get('/assets', editor, wrap(async (_req, res) => {
    const items = await db().select().from(assets).orderBy(desc(assets.createdAt)).limit(200);
    res.json({ items: items.map((a) => ({ id: a.id, src: a.src, width: a.width, height: a.height, bytes: a.bytes, name: a.originalName ?? null, sourceUrl: a.sourceUrl ?? null })) });
  }));

  /* ---------- collections ---------- */
  r.get('/collections', editor, wrap(async (_req, res) => {
    const cols = await db().select().from(collections).orderBy(asc(collections.position), asc(collections.title));
    const counts = await db()
      .select({ c: sql<string>`unnest(${products.collections})`, status: products.status, n: sql<number>`count(*)::int` })
      .from(products)
      .groupBy(sql`1`, products.status);
    res.json({
      items: cols.map((c) => ({
        id: c.id, title: c.title, slug: c.slug, parent: c.parent ?? null, description: c.description, heroImage: c.heroImage ?? null, active: c.active, position: c.position, seo: c.seo,
        products: counts.filter((x) => x.c === c.slug).reduce((s, x) => s + x.n, 0),
        published: counts.filter((x) => x.c === c.slug && x.status === 'published').reduce((s, x) => s + x.n, 0),
      })),
    });
  }));
  r.post('/collections', mgr, wrap(async (req, res) => {
    const d = parse(collectionInputSchema, req.body);
    const slug = d.slug ?? slugify(d.title);
    const [exists] = await db().select({ id: collections.id }).from(collections).where(eq(collections.slug, slug));
    if (exists) throw conflict('A collection with this slug exists', 'duplicate');
    const [c] = await db().insert(collections).values({ ...d, slug, parent: d.parent ?? null, heroImage: d.heroImage ?? null }).returning();
    await audit(req, 'collection.create', 'collection', c!.id, c!.title);
    void revalidate('collections');
    res.status(201).json({ id: c!.id });
  }));
  r.put('/collections/:id', mgr, wrap(async (req, res) => {
    const d = parse(collectionInputSchema, req.body);
    const [c] = await db()
      .update(collections)
      .set({ title: d.title, ...(d.slug ? { slug: d.slug } : {}), parent: d.parent ?? null, description: d.description, heroImage: d.heroImage ?? null, active: d.active, position: d.position, seo: d.seo, updatedAt: new Date() })
      .where(eq(collections.id, idParam(req)))
      .returning();
    if (!c) throw notFound('Collection');
    await audit(req, 'collection.update', 'collection', c.id, c.title);
    void revalidate('collections', 'products');
    res.json({ id: c.id });
  }));
  r.delete('/collections/:id', admin, wrap(async (req, res) => {
    const [c] = await db().select().from(collections).where(eq(collections.id, idParam(req)));
    if (!c) throw notFound('Collection');
    const [used] = await db().select({ id: products.id }).from(products).where(sql`${c.slug} = any(${products.collections})`).limit(1);
    if (used) throw conflict('Remove products from this collection first', 'not_empty');
    await db().delete(collections).where(eq(collections.id, c.id));
    await audit(req, 'collection.delete', 'collection', c.id, c.title);
    void revalidate('collections');
    res.json({ ok: true });
  }));

  /* ---------- journal ---------- */
  const articleDTO = (a: typeof articles.$inferSelect) => ({ id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body, coverImage: a.coverImage ?? null, tags: a.tags, status: a.status, publishedAt: a.publishedAt?.toISOString() ?? null, seo: a.seo });
  r.get('/articles', editor, wrap(async (_req, res) => {
    res.json({ items: (await db().select().from(articles).orderBy(desc(articles.updatedAt))).map(articleDTO) });
  }));
  r.post('/articles', editor, wrap(async (req, res) => {
    const d = parse(articleInputSchema, req.body);
    const slug = d.slug ?? slugify(d.title);
    const [exists] = await db().select({ id: articles.id }).from(articles).where(eq(articles.slug, slug));
    if (exists) throw conflict('An article with this slug exists', 'duplicate');
    const [a] = await db().insert(articles).values({ ...d, body: cleanHtml(d.body), slug, coverImage: d.coverImage ?? null, publishedAt: d.status === 'published' ? new Date() : null }).returning();
    await audit(req, 'article.create', 'article', a!.id, a!.title);
    void revalidate('articles');
    res.status(201).json({ id: a!.id });
  }));
  r.put('/articles/:id', editor, wrap(async (req, res) => {
    const d = parse(articleInputSchema, req.body);
    const [cur] = await db().select().from(articles).where(eq(articles.id, idParam(req)));
    if (!cur) throw notFound('Article');
    const [a] = await db()
      .update(articles)
      .set({ ...d, body: cleanHtml(d.body), slug: d.slug ?? cur.slug, coverImage: d.coverImage ?? null, publishedAt: d.status === 'published' ? (cur.publishedAt ?? new Date()) : cur.publishedAt, updatedAt: new Date() })
      .where(eq(articles.id, cur.id))
      .returning();
    await audit(req, 'article.update', 'article', a!.id, a!.title);
    void revalidate('articles');
    res.json({ id: a!.id });
  }));
  r.delete('/articles/:id', mgr, wrap(async (req, res) => {
    const [a] = await db().delete(articles).where(eq(articles.id, idParam(req))).returning();
    if (a) await audit(req, 'article.delete', 'article', a.id, a.title);
    void revalidate('articles');
    res.json({ ok: true });
  }));

  /* ---------- information pages ---------- */
  r.get('/pages', editor, wrap(async (_req, res) => {
    const items = await db().select().from(pages).orderBy(asc(pages.title));
    res.json({ items: items.map((p) => ({ id: p.id, slug: p.slug, title: p.title, body: p.body, status: p.status, seo: p.seo })) });
  }));
  r.put('/pages/:id', editor, wrap(async (req, res) => {
    const d = parse(z.object({ title: z.string().min(1).max(120), body: z.string().max(60000), status: z.enum(['draft', 'published']) }), req.body);
    const [p] = await db().update(pages).set({ ...d, body: cleanHtml(d.body), updatedAt: new Date() }).where(eq(pages.id, idParam(req))).returning();
    if (!p) throw notFound('Page');
    await audit(req, 'page.update', 'page', p.id, p.title);
    void revalidate('pages');
    res.json({ id: p.id });
  }));

  /* ---------- homepage campaigns ---------- */
  r.get('/campaigns', editor, wrap(async (_req, res) => {
    res.json({ items: await db().select().from(campaigns) });
  }));
  r.put('/campaigns', editor, wrap(async (req, res) => {
    const d = parse(campaignInputSchema, req.body);
    const values = { ...d, image: d.image ?? null, updatedAt: new Date() };
    const [c] = await db().insert(campaigns).values(values).onConflictDoUpdate({ target: campaigns.key, set: values }).returning();
    await audit(req, 'campaign.update', 'campaign', c!.id, d.key);
    void revalidate('campaigns');
    res.json({ id: c!.id });
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
    const items = await db().select().from(users).where(ne(users.role, 'customer')).orderBy(asc(users.createdAt));
    res.json({ items: items.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, lastLoginAt: u.lastLoginAt?.toISOString() ?? null })) });
  }));
  r.post('/staff', admin, wrap(async (req, res) => {
    const d = parse(signupSchema.extend({ role: z.enum(ROLES).exclude(['customer']) }), req.body);
    const [exists] = await db().select({ id: users.id }).from(users).where(eq(users.email, d.email));
    if (exists) throw conflict('That email is already registered', 'email_taken');
    const [u] = await db().insert(users).values({ name: d.name, email: d.email, role: d.role, passwordHash: await hashPassword(d.password) }).returning();
    await audit(req, 'staff.create', 'user', u!.id, `${u!.email} as ${u!.role}`);
    res.status(201).json({ id: u!.id });
  }));
  r.patch('/staff/:id', admin, wrap(async (req, res) => {
    const d = parse(z.object({ role: z.enum(ROLES) }), req.body);
    const id = idParam(req);
    if (id === req.user!.id) throw conflict('You cannot change your own role', 'self_change');
    const [u] = await db().update(users).set({ role: d.role, tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id)).returning();
    if (!u) throw notFound('User');
    await audit(req, 'staff.role', 'user', u.id, `${u.email} → ${d.role}`);
    res.json({ ok: true });
  }));

  /* ---------- audit log ---------- */
  r.get('/audit', admin, wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await db().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50).offset((page - 1) * 50);
    res.json({ items: items.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), actor: a.actorEmail ?? 'system', action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary })) });
  }));

  /* ---------- reports ---------- */
  r.get('/reports/summary', mgr, wrap(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const paid = and(inArray(orders.status, PAID), gte(orders.createdAt, since));
    const [[t], byDay, top, byStatus, [low], [unknown]] = await Promise.all([
      db().select({ revenue: sql<number>`coalesce(sum(${orders.total}),0)::int`, orders: sql<number>`count(*)::int`, discounts: sql<number>`coalesce(sum(${orders.discountTotal}),0)::int` }).from(orders).where(paid),
      db().select({ date: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`, revenue: sql<number>`sum(${orders.total})::int`, orders: sql<number>`count(*)::int` }).from(orders).where(paid).groupBy(sql`1`).orderBy(sql`1`),
      db()
        .select({ title: orderLines.title, units: sql<number>`sum(${orderLines.qty})::int`, revenue: sql<number>`sum(${orderLines.lineTotal})::int` })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .where(paid)
        .groupBy(orderLines.title)
        .orderBy(desc(sql`2`))
        .limit(10),
      db().select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).where(gte(orders.createdAt, since)).groupBy(orders.status),
      db()
        .select({ n: sql<number>`count(distinct ${products.id})::int` })
        .from(products)
        .innerJoin(variants, eq(variants.productId, products.id))
        .where(and(eq(products.status, 'published'), eq(variants.active, true), eq(variants.madeToOrder, false), gte(variants.stock, 0), sql`${variants.stock} <= 3`)),
      db()
        .select({ n: sql<number>`count(distinct ${products.id})::int` })
        .from(products)
        .innerJoin(variants, eq(variants.productId, products.id))
        .where(and(eq(variants.active, true), eq(variants.madeToOrder, false), isNull(variants.stock))),
    ]);
    const tot = t ?? { revenue: 0, orders: 0, discounts: 0 };
    res.json({
      days, revenue: tot.revenue, orders: tot.orders, discounts: tot.discounts, aov: tot.orders ? Math.round(tot.revenue / tot.orders) : 0,
      byDay, topProducts: top, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
      lowStockProducts: low?.n ?? 0, productsWithUnknownStock: unknown?.n ?? 0,
    });
  }));

  return r;
}
