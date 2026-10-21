import { Router } from 'express';
import {
  cartInputSchema,
  checkoutSchema,
  newsletterSchema,
  productQuerySchema,
  trackOrderSchema,
  verifyPaymentSchema,
  type CampaignDTO,
  type CollectionDTO,
  type PublicSettingsDTO,
} from '@cityroyalty/shared';
import type { Deps } from '../app';
import { loadUser, safeEqual } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { parse, parseQuery, wrap } from '../lib/http';
import { getSettings } from '../lib/settings';
import { Article, Campaign, Collection, Order, Page, Payment, Product, Shipment, Subscriber } from '../models';
import { getAdapter } from '../payments';
import { listProducts, toProduct } from '../services/catalog';
import { priceCart } from '../services/pricing';
import { toOrderDTO } from '../services/orders';

const cacheable = (seconds: number) => (_req: any, res: any, next: any) => {
  res.set('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);
  next();
};

export function publicRoutes({ config, adapters, orders, rate }: Deps) {
  const r = Router();

  /* ---------- catalogue ---------- */
  async function collectionTree(slug: string): Promise<string[]> {
    const children = await Collection.find({ parent: slug, active: true }).select('slug').lean();
    return [slug, ...children.map((c) => c.slug)];
  }

  r.get('/products', cacheable(30), wrap(async (req, res) => {
    const q = parseQuery(productQuerySchema, req);
    const slugs = q.collection && q.collection !== 'all' ? await collectionTree(q.collection) : undefined;
    res.json(await listProducts(q, slugs));
  }));

  r.get('/products/:slug', cacheable(30), wrap(async (req, res) => {
    const p = await Product.findOne({ slug: String(req.params.slug), status: 'published' }).lean();
    if (!p) throw notFound('Product');
    const related = await Product.find({ status: 'published', _id: { $ne: p._id }, collections: { $in: p.collections } })
      .sort({ featured: -1, publishedAt: -1 })
      .limit(8)
      .lean();
    const { toCard } = await import('../services/catalog');
    res.json({ product: toProduct(p as any), related: related.map((x) => toCard(x as any)) });
  }));

  r.get('/collections', cacheable(60), wrap(async (_req, res) => {
    const cols = await Collection.find({ active: true }).sort({ position: 1, title: 1 }).lean();
    const counts = await Product.aggregate([{ $match: { status: 'published' } }, { $unwind: '$collections' }, { $group: { _id: '$collections', n: { $sum: 1 } } }]);
    const n = new Map<string, number>(counts.map((c) => [c._id as string, c.n as number]));
    const own = (slug: string) => n.get(slug) ?? 0;
    const treeCount = async (slug: string) => {
      const kids = cols.filter((x) => x.parent === slug).map((x) => x.slug);
      return kids.length ? Product.countDocuments({ status: 'published', collections: { $in: [slug, ...kids] } }) : own(slug);
    };
    const totals = new Map<string, number>(await Promise.all(cols.map(async (c) => [c.slug, await treeCount(c.slug)] as const)));
    const out: CollectionDTO[] = cols
      .map((c) => ({
        id: String(c._id), slug: c.slug, title: c.title, description: c.description, parent: c.parent ?? null, heroImage: c.heroImage ?? null,
        count: totals.get(c.slug) ?? 0, seo: { title: c.seo?.title ?? undefined, description: c.seo?.description ?? undefined },
      }))
      // never expose a category with no confirmed (published) products
      .filter((c) => c.count > 0);
    res.json({ items: out });
  }));

  r.get('/collections/:slug', cacheable(60), wrap(async (req, res) => {
    const c = await Collection.findOne({ slug: String(req.params.slug), active: true }).lean();
    if (!c) throw notFound('Collection');
    const slugs = await collectionTree(c.slug);
    const count = await Product.countDocuments({ status: 'published', collections: { $in: slugs } });
    if (!count) throw notFound('Collection');
    res.json({
      id: String(c._id), slug: c.slug, title: c.title, description: c.description, parent: c.parent ?? null, heroImage: c.heroImage ?? null, count,
      seo: { title: c.seo?.title ?? undefined, description: c.seo?.description ?? undefined },
    } satisfies CollectionDTO);
  }));

  r.get('/search', wrap(async (req, res) => {
    const q = parseQuery(productQuerySchema, req);
    if (!q.q) return res.json({ items: [], page: 1, limit: q.limit, total: 0, pages: 1, facets: { sizes: [], colours: [], materials: [], price: { min: 0, max: 0 } } });
    res.json(await listProducts(q));
  }));

  /* ---------- content ---------- */
  r.get('/articles', cacheable(60), wrap(async (_req, res) => {
    const items = await Article.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(30).lean();
    res.json({ items: items.map(toArticle) });
  }));
  r.get('/articles/:slug', cacheable(60), wrap(async (req, res) => {
    const a = await Article.findOne({ slug: String(req.params.slug), status: 'published' }).lean();
    if (!a) throw notFound('Article');
    res.json(toArticle(a));
  }));
  r.get('/pages/:slug', cacheable(60), wrap(async (req, res) => {
    const p = await Page.findOne({ slug: String(req.params.slug), status: 'published' }).lean();
    if (!p) throw notFound('Page');
    res.json({ slug: p.slug, title: p.title, body: p.body, updatedAt: (p as any).updatedAt.toISOString() });
  }));
  r.get('/campaigns', cacheable(30), wrap(async (_req, res) => {
    const items = await Campaign.find({ active: true }).lean();
    res.json({
      items: items.map((c): CampaignDTO => ({ key: c.key, headline: c.headline, subline: c.subline, ctaLabel: c.ctaLabel, ctaHref: c.ctaHref, image: c.image ?? null, imageAlt: c.imageAlt })),
    });
  }));
  r.get('/settings/public', cacheable(60), wrap(async (_req, res) => {
    const s = await getSettings();
    const providers = (['razorpay', 'stripe', 'mock'] as const).filter((p) => adapters[p]);
    if (s.shipping.codEnabled) providers.push('cod' as never);
    const dto: PublicSettingsDTO = {
      storeName: s.storeName, supportEmail: s.supportEmail, supportPhone: s.supportPhone, address: s.address, social: s.social,
      shipping: { freeThreshold: s.shipping.freeThreshold, estimate: s.shipping.estimate, codEnabled: s.shipping.codEnabled },
      tax: s.tax, returns: s.returns, brandFacts: s.brandFacts, paymentProviders: providers, razorpayKeyId: config.RAZORPAY_KEY_ID,
    };
    res.json(dto);
  }));

  r.post('/newsletter', rate.newsletter, wrap(async (req, res) => {
    const { email, source } = parse(newsletterSchema, req.body);
    await Subscriber.updateOne({ email }, { $setOnInsert: { email, source }, $unset: { unsubscribedAt: '' } }, { upsert: true });
    res.status(201).json({ ok: true });
  }));

  /* ---------- cart & checkout ---------- */
  r.post('/cart/price', wrap(async (req, res) => {
    const input = parse(cartInputSchema, req.body);
    const { priced } = await priceCart(input, await getSettings());
    res.json(priced);
  }));

  r.post('/checkout', rate.checkout, loadUser, wrap(async (req, res) => {
    const input = parse(checkoutSchema, req.body);
    const result = await orders.checkout(input, req.user?.id);
    if (input.subscribe) await Subscriber.updateOne({ email: input.email }, { $setOnInsert: { email: input.email, source: 'checkout' } }, { upsert: true });
    res.status(201).json(result);
  }));

  r.post('/checkout/verify', rate.checkout, wrap(async (req, res) => {
    const body = parse(verifyPaymentSchema, req.body);
    const order = await orders.verifyForCustomer(body.orderNumber, body.accessToken);
    if (order.status === 'paid' || order.status === 'processing') return res.json({ status: 'paid', order: toOrderDTO(order) });
    const payment = await Payment.findOne({ orderId: order._id, provider: body.provider }).sort({ createdAt: -1 });
    if (!payment?.providerOrderId) throw badRequest('No payment in progress for this order');
    const result = await getAdapter(adapters, body.provider).verifyClientPayment({ providerOrderId: payment.providerOrderId, payload: body.payload });
    if (result.status === 'paid') {
      const o = await orders.markPaid(order._id, { providerPaymentId: result.providerPaymentId, amount: result.amount, via: 'client-verify' });
      return res.json({ status: o.order?.status === 'paid' ? 'paid' : 'pending', order: o.order ? toOrderDTO(o.order) : undefined });
    }
    if (result.status === 'failed') {
      const o = await orders.markFailed(order._id, result.reason);
      return res.json({ status: 'failed', order: o.order ? toOrderDTO(o.order) : undefined });
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
    const number = String(req.query.order ?? '');
    const token = String(req.query.token ?? '');
    const order = await orders.verifyForCustomer(number, token);
    const shipments = await Shipment.find({ orderId: order._id }).lean();
    res.json(toOrderDTO(order, shipments));
  }));

  /** Guest tracking by order number + email. Uniform error to avoid order-number enumeration. */
  r.post('/orders/track', rate.auth, wrap(async (req, res) => {
    const { orderNumber, email } = parse(trackOrderSchema, req.body);
    const order = await Order.findOne({ number: orderNumber.toUpperCase() });
    if (!order || !safeEqual(order.email, email)) throw notFound('Order');
    const shipments = await Shipment.find({ orderId: order._id }).lean();
    res.json(toOrderDTO(order, shipments));
  }));

  return r;
}

function toArticle(a: any) {
  return {
    id: String(a._id), slug: a.slug, title: a.title, excerpt: a.excerpt, body: a.body, coverImage: a.coverImage ?? null, tags: a.tags,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null, seo: { title: a.seo?.title ?? undefined, description: a.seo?.description ?? undefined },
  };
}
