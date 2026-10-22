import { Router, type RequestHandler } from 'express';
import { and, arrayOverlaps, asc, desc, eq, ne, sql } from 'drizzle-orm';
import {
  cartInputSchema,
  checkoutSchema,
  newsletterSchema,
  productQuerySchema,
  trackOrderSchema,
  verifyPaymentSchema,
  type ArticleDTO,
  type CampaignDTO,
  type CollectionDTO,
  type PaymentProvider,
  type PublicSettingsDTO,
} from '@cityroyalty/shared';
import type { Deps } from '../app';
import { db } from '../db';
import { articles, campaigns, collections, pages, payments, products, subscribers, type ProductRow } from '../db/schema';
import { loadUser, safeEqual } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { parse, parseQuery, wrap } from '../lib/http';
import { getSettings } from '../lib/settings';
import { getAdapter } from '../payments';
import { listProducts, toCard, toProduct } from '../services/catalog';
import { loadOrder, shipmentsFor, toOrderDTO } from '../services/orders';
import { priceCart } from '../services/pricing';
import { hydrate } from '../services/products';

const cacheable =
  (seconds: number): RequestHandler =>
  (_req, res, next) => {
    res.set('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);
    next();
  };

const toArticle = (a: typeof articles.$inferSelect): ArticleDTO => ({
  id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, body: a.body, coverImage: a.coverImage ?? null, tags: a.tags,
  publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null, seo: { title: a.seo.title || undefined, description: a.seo.description || undefined },
});

async function collectionTree(slug: string): Promise<string[]> {
  const kids = await db().select({ slug: collections.slug }).from(collections).where(and(eq(collections.parent, slug), eq(collections.active, true)));
  return [slug, ...kids.map((c) => c.slug)];
}
const publishedIn = (slugs: string[]) => and(eq(products.status, 'published'), arrayOverlaps(products.collections, slugs));
const countPublished = async (slugs: string[]) => (await db().select({ n: sql<number>`count(*)::int` }).from(products).where(publishedIn(slugs)))[0]!.n;

export function publicRoutes({ config, adapters, orders, rate }: Deps) {
  const r = Router();

  // abandoned payment holds are released lazily as traffic comes in (works on serverless, no long-running timer)
  let lastSweep = 0;
  const sweep: RequestHandler = (_req, _res, next) => {
    if (Date.now() - lastSweep > 60_000) {
      lastSweep = Date.now();
      void orders.expireStale().catch(() => undefined);
    }
    next();
  };

  /* ---------- catalogue ---------- */
  r.get('/products', cacheable(30), wrap(async (req, res) => {
    const q = parseQuery(productQuerySchema, req);
    const slugs = q.collection && q.collection !== 'all' ? await collectionTree(q.collection) : undefined;
    res.json(await listProducts(q, slugs));
  }));

  r.get('/products/:slug', cacheable(30), wrap(async (req, res) => {
    const [row] = await db().select().from(products).where(and(eq(products.slug, String(req.params.slug)), eq(products.status, 'published')));
    if (!row) throw notFound('Product');
    const [p] = await hydrate([row]);
    const rel: ProductRow[] = p!.collections.length
      ? await db().select().from(products).where(and(publishedIn(p!.collections), ne(products.id, row.id))).orderBy(desc(products.featured), sql`${products.publishedAt} desc nulls last`).limit(8)
      : [];
    res.json({ product: toProduct(p!), related: (await hydrate(rel)).map(toCard) });
  }));

  r.get('/collections', cacheable(60), wrap(async (_req, res) => {
    const cols = await db().select().from(collections).where(eq(collections.active, true)).orderBy(asc(collections.position), asc(collections.title));
    const out: CollectionDTO[] = [];
    for (const c of cols) {
      const kids = cols.filter((x) => x.parent === c.slug).map((x) => x.slug);
      const count = await countPublished([c.slug, ...kids]);
      // never expose a category with no confirmed (published) products
      if (count > 0)
        out.push({ id: c.id, slug: c.slug, title: c.title, description: c.description, parent: c.parent ?? null, heroImage: c.heroImage ?? null, count, seo: { title: c.seo.title || undefined, description: c.seo.description || undefined } });
    }
    res.json({ items: out });
  }));

  r.get('/collections/:slug', cacheable(60), wrap(async (req, res) => {
    const [c] = await db().select().from(collections).where(and(eq(collections.slug, String(req.params.slug)), eq(collections.active, true)));
    if (!c) throw notFound('Collection');
    const count = await countPublished(await collectionTree(c.slug));
    if (!count) throw notFound('Collection');
    res.json({
      id: c.id, slug: c.slug, title: c.title, description: c.description, parent: c.parent ?? null, heroImage: c.heroImage ?? null, count,
      seo: { title: c.seo.title || undefined, description: c.seo.description || undefined },
    } satisfies CollectionDTO);
  }));

  r.get('/search', wrap(async (req, res) => {
    const q = parseQuery(productQuerySchema, req);
    if (!q.q) return void res.json({ items: [], page: 1, limit: q.limit, total: 0, pages: 1, facets: { sizes: [], colours: [], materials: [], price: { min: 0, max: 0 } } });
    res.json(await listProducts(q));
  }));

  /* ---------- content ---------- */
  r.get('/articles', cacheable(60), wrap(async (_req, res) => {
    const items = await db().select().from(articles).where(eq(articles.status, 'published')).orderBy(sql`${articles.publishedAt} desc nulls last`).limit(30);
    res.json({ items: items.map(toArticle) });
  }));
  r.get('/articles/:slug', cacheable(60), wrap(async (req, res) => {
    const [a] = await db().select().from(articles).where(and(eq(articles.slug, String(req.params.slug)), eq(articles.status, 'published')));
    if (!a) throw notFound('Article');
    res.json(toArticle(a));
  }));
  r.get('/pages/:slug', cacheable(60), wrap(async (req, res) => {
    const [p] = await db().select().from(pages).where(and(eq(pages.slug, String(req.params.slug)), eq(pages.status, 'published')));
    if (!p) throw notFound('Page');
    res.json({ slug: p.slug, title: p.title, body: p.body, updatedAt: p.updatedAt.toISOString() });
  }));
  r.get('/campaigns', cacheable(30), wrap(async (_req, res) => {
    const items = await db().select().from(campaigns).where(eq(campaigns.active, true));
    res.json({ items: items.map((c): CampaignDTO => ({ key: c.key, headline: c.headline, subline: c.subline, ctaLabel: c.ctaLabel, ctaHref: c.ctaHref, image: c.image ?? null, imageAlt: c.imageAlt })) });
  }));
  r.get('/settings/public', cacheable(60), wrap(async (_req, res) => {
    const s = await getSettings();
    const providers: PaymentProvider[] = (['razorpay', 'stripe', 'mock'] as const).filter((p) => adapters[p]);
    if (s.shipping.codEnabled) providers.push('cod');
    const dto: PublicSettingsDTO = {
      storeName: s.storeName, supportEmail: s.supportEmail, supportPhone: s.supportPhone, address: s.address, social: s.social,
      shipping: { freeThreshold: s.shipping.freeThreshold, estimate: s.shipping.estimate, codEnabled: s.shipping.codEnabled },
      tax: s.tax, returns: s.returns, brandFacts: s.brandFacts, paymentProviders: providers, razorpayKeyId: config.RAZORPAY_KEY_ID,
    };
    res.json(dto);
  }));

  r.post('/newsletter', rate.newsletter, wrap(async (req, res) => {
    const { email, source } = parse(newsletterSchema, req.body);
    await db().insert(subscribers).values({ email, source: source ?? null }).onConflictDoUpdate({ target: subscribers.email, set: { unsubscribedAt: null } });
    res.status(201).json({ ok: true });
  }));

  /* ---------- cart & checkout ---------- */
  r.post('/cart/price', sweep, wrap(async (req, res) => {
    const input = parse(cartInputSchema, req.body);
    const { priced } = await priceCart(input, await getSettings());
    res.json(priced);
  }));

  r.post('/checkout', rate.checkout, loadUser, sweep, wrap(async (req, res) => {
    const input = parse(checkoutSchema, req.body);
    const result = await orders.checkout(input, req.user?.id);
    if (input.subscribe) await db().insert(subscribers).values({ email: input.email, source: 'checkout' }).onConflictDoNothing();
    res.status(201).json(result);
  }));

  r.post('/checkout/verify', rate.checkout, wrap(async (req, res) => {
    const body = parse(verifyPaymentSchema, req.body);
    const order = await orders.verifyForCustomer(body.orderNumber, body.accessToken);
    if (order.status === 'paid' || order.status === 'processing') return void res.json({ status: 'paid', order: toOrderDTO(order) });
    const [payment] = await db().select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.provider, body.provider))).orderBy(desc(payments.createdAt)).limit(1);
    if (!payment?.providerOrderId) throw badRequest('No payment in progress for this order');
    const result = await getAdapter(adapters, body.provider).verifyClientPayment({ providerOrderId: payment.providerOrderId, payload: body.payload });
    if (result.status === 'paid') {
      const o = await orders.markPaid(order.id, { providerPaymentId: result.providerPaymentId, amount: result.amount, via: 'client-verify' });
      return void res.json({ status: o.order?.status === 'paid' ? 'paid' : 'pending', order: o.order ? toOrderDTO(o.order) : undefined });
    }
    if (result.status === 'failed') {
      const o = await orders.markFailed(order.id, result.reason);
      return void res.json({ status: 'failed', order: o.order ? toOrderDTO(o.order) : undefined });
    }
    res.json({ status: 'pending', order: toOrderDTO(order) });
  }));

  r.post('/checkout/retry', rate.checkout, wrap(async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.orderNumber !== 'string' || typeof b.accessToken !== 'string') throw badRequest('orderNumber and accessToken are required');
    res.json(await orders.retryPayment(b.orderNumber, b.accessToken, b.provider));
  }));

  /** Order summary for the confirmation / failed pages (token proves the caller placed the order). */
  r.get('/orders/by-token', wrap(async (req, res) => {
    const order = await orders.verifyForCustomer(String(req.query.order ?? ''), String(req.query.token ?? ''));
    res.json(toOrderDTO(order, await shipmentsFor(order.id)));
  }));

  /** Guest tracking by order number + email. Uniform error to avoid order-number enumeration. */
  r.post('/orders/track', rate.auth, wrap(async (req, res) => {
    const { orderNumber, email } = parse(trackOrderSchema, req.body);
    const order = await loadOrder({ number: orderNumber.toUpperCase() });
    if (!order || !safeEqual(order.email, email)) throw notFound('Order');
    res.json(toOrderDTO(order, await shipmentsFor(order.id)));
  }));

  return r;
}
