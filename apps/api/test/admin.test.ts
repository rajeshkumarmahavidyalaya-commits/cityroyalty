import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs } from '../src/db/schema';
import { loadProduct } from '../src/services/products';
import { checkoutBody, count, makeCollection, makeProduct, orderById, orderByNumber, sessionFor, startTestApp, stockOf } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(() => t.reset());

const input = (over: Record<string, unknown> = {}) => ({
  title: 'Tan Leather Jacket', sku: 'TAN1', description: 'desc', collections: ['mens-jacket'], options: [{ name: 'Size', values: ['M-44'] }],
  variants: [{ sku: 'TAN1-M', options: { Size: 'M-44' }, price: 799900, compareAtPrice: 1599900, stock: 4, madeToOrder: false, active: true }], ...over,
});
const png = (w = 900, h = 1100) => sharp({ create: { width: w, height: h, channels: 3, background: '#8B5E3C' } }).png().toBuffer();

describe('admin product workflow', () => {
  it('creates a draft with a unique slug and blockers listed', async () => {
    await makeCollection();
    const s = await sessionFor(t.app, 'content');
    const a = await s.post('/api/v1/admin/products', input());
    const b = await s.post('/api/v1/admin/products', input());
    expect(a.status).toBe(201);
    expect(a.body.status).toBe('draft');
    expect(a.body.slug).toBe('tan-leather-jacket');
    expect(b.body.slug).toBe('tan-leather-jacket-2');
    expect(a.body.blockers).toContain('No product photograph');
  });

  it('cannot publish without a verified photo, and concept images do not count', async () => {
    await makeCollection();
    const mgr = await sessionFor(t.app, 'manager');
    const p = (await mgr.post('/api/v1/admin/products', input())).body;
    const blocked = await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'review' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('publish_blocked');

    // upload a concept image
    const concept = await mgr.raw('post', `/api/v1/admin/products/${p.id}/images`).field('slot', 'lifestyle').field('kind', 'concept').field('alt', 'concept render').attach('file', await png(), 'c.png');
    expect(concept.status).toBe(201);
    const stillBlocked = await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'review' });
    expect(stillBlocked.body.error.details.blockers[0]).toMatch(/concept/i);

    // upload a real photo → processed into AVIF/WebP ladder
    const real = await mgr.raw('post', `/api/v1/admin/products/${p.id}/images`).field('slot', 'front').field('kind', 'photo').field('alt', 'Tan jacket front').attach('file', await png(), 'p.png');
    expect(real.status).toBe(201);
    const img = real.body.images.find((i: { kind: string }) => i.kind === 'photo');
    expect(img.width).toBeLessThanOrEqual(900);
    const doc = await loadProduct(p.id);
    const photo = doc!.images.find((i) => i.kind === 'photo')!;
    expect(photo.avif.length).toBeGreaterThanOrEqual(2);
    expect(photo.webp.every((s) => s.url!.startsWith('/media/images/'))).toBe(true);
    expect(photo.blur).toMatch(/^data:image\/webp/);

    expect((await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'published' })).body.error.code).toBe('needs_review');
    expect((await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'review' })).status).toBe(200);
    const pub = await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'published' });
    expect(pub.status).toBe(200);
    expect(pub.body.publishedAt).toBeTruthy();

    // public API serves the photo only
    const pubRes = await request(t.app).get('/api/v1/products/tan-leather-jacket');
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.product.images).toHaveLength(1);

    // removing the last verified photo pulls the product off the storefront
    await mgr.delete(`/api/v1/admin/products/${p.id}/images/${img.id}`);
    expect((await loadProduct(p.id))!.status).toBe('draft');
    expect((await request(t.app).get('/api/v1/products/tan-leather-jacket')).status).toBe(404);
  });

  it('only managers/admins can publish; content editors can edit and send to review', async () => {
    await makeCollection();
    const p = await makeProduct({ status: 'draft' });
    const content = await sessionFor(t.app, 'content');
    expect((await content.post(`/api/v1/admin/products/${p.id}/status`, { status: 'review' })).status).toBe(200);
    expect((await content.post(`/api/v1/admin/products/${p.id}/status`, { status: 'published' })).status).toBe(400);
    const mgr = await sessionFor(t.app, 'manager');
    expect((await mgr.post(`/api/v1/admin/products/${p.id}/status`, { status: 'published' })).status).toBe(200);
  });

  it('rejects non-images and oversized uploads', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    const p = await makeProduct({ status: 'draft' });
    const bad = await mgr.raw('post', `/api/v1/admin/products/${p.id}/images`).field('slot', 'front').field('alt', 'x').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    const tiny = await mgr.raw('post', `/api/v1/admin/products/${p.id}/images`).field('slot', 'front').field('alt', 'x').attach('file', await png(50, 50), 'tiny.png');
    expect(tiny.status).toBe(400);
  });

  it('editing a live product so it has a blocker returns it to draft', async () => {
    await makeCollection();
    const mgr = await sessionFor(t.app, 'manager');
    const p = await makeProduct({ status: 'published' });
    const full = (await mgr.get(`/api/v1/admin/products/${p.id}`)).body;
    const res = await mgr.put(`/api/v1/admin/products/${p.id}`, { ...input(), variants: full.variants.map((v: object) => ({ ...v, stock: null })) });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.blockers.join()).toMatch(/Stock/);
  });

  it('writes an audit trail', async () => {
    await makeCollection();
    const mgr = await sessionFor(t.app, 'manager');
    await mgr.post('/api/v1/admin/products', input());
    const admin = await sessionFor(t.app, 'admin');
    const log = (await admin.get('/api/v1/admin/audit')).body.items;
    expect(log[0].action).toBe('product.create');
    expect(await count(auditLogs)).toBeGreaterThan(0);
  });
});

describe('admin order management', () => {
  async function paidOrder() {
    const p = await makeProduct({ stock: 5 });
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p));
    await request(t.app).post('/api/v1/checkout/verify').send({ orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'success' } });
    return { p, order: (await orderByNumber(res.body.order.number))! };
  }

  it('walks paid → shipped → delivered with emails, and blocks invalid jumps', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    const { order } = await paidOrder();
    expect((await mgr.post(`/api/v1/admin/orders/${order.id}/status`, { status: 'delivered' })).status).toBe(409);
    const ship = await mgr.post(`/api/v1/admin/orders/${order.id}/shipments`, { carrier: 'Delhivery', trackingNumber: 'DL123456', trackingUrl: 'https://track.test/DL123456' });
    expect(ship.status).toBe(201);
    expect((await orderById(order.id))!.status).toBe('shipped');
    expect(t.deps.mailer.outbox.some((m) => m.subject.includes('on its way'))).toBe(true);
    const delivered = await mgr.post(`/api/v1/admin/orders/${order.id}/status`, { status: 'delivered' });
    expect(delivered.status).toBe(200);
    const detail = (await mgr.get(`/api/v1/admin/orders/${order.id}`)).body;
    expect(detail.shipments[0].trackingNumber).toBe('DL123456');
    expect(detail.timeline.map((x: { status: string }) => x.status)).toEqual(expect.arrayContaining(['pending_payment', 'paid', 'shipped', 'delivered']));
  });

  it('cancelling a paid order restocks exactly once; refunds are capped at the amount paid', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    const { p, order } = await paidOrder();
    expect((await stockOf(p.id))).toBe(4);
    const over = await mgr.post(`/api/v1/admin/orders/${order.id}/refund`, { amount: order.total + 1, reason: 'too much' });
    expect(over.status).toBe(400);
    expect((await mgr.post(`/api/v1/admin/orders/${order.id}/refund`, { amount: order.total, reason: 'customer request' })).status).toBe(200);
    const after = (await orderById(order.id))!;
    expect(after.status).toBe('refunded');
    expect(after.paymentStatus).toBe('refunded');
    expect((await stockOf(p.id))).toBe(5); // restocked once
    expect((await mgr.post(`/api/v1/admin/orders/${order.id}/status`, { status: 'cancelled' })).status).toBe(409);
    expect((await stockOf(p.id))).toBe(5);
  });

  it('inventory adjustments update availability and are audited', async () => {
    await makeCollection();
    const mgr = await sessionFor(t.app, 'manager');
    const p = await makeProduct({ stock: 0, sizes: ['M-44'] });
    expect((await request(t.app).get(`/api/v1/products/${p.slug}`)).body.product.available).toBe(false);
    const adj = await mgr.post('/api/v1/admin/inventory/adjust', { variantId: p.variants[0]!.id, stock: 7, reason: 'stock count' });
    expect(adj.status).toBe(200);
    expect((await request(t.app).get(`/api/v1/products/${p.slug}`)).body.product.available).toBe(true);
    expect(await count(auditLogs, eq(auditLogs.action, 'inventory.adjust'))).toBe(1);
  });

  it('customer returns flow and privacy erasure', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    const admin = await sessionFor(t.app, 'admin');
    const cust = await sessionFor(t.app, 'customer', 'buyer@t.test');
    const p = await makeProduct({ stock: 5 });
    const res = await cust.post('/api/v1/checkout', checkoutBody(p, { email: 'buyer@t.test' }));
    await request(t.app).post('/api/v1/checkout/verify').send({ orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'success' } });
    const order = (await orderByNumber(res.body.order.number))!;
    const early = await cust.post(`/api/v1/me/orders/${order.number}/return`, { lines: [{ variantId: p.variants[0]!.id, qty: 1 }], reason: 'Does not fit' });
    expect(early.status).toBe(409); // not shipped yet
    const sh = await mgr.post(`/api/v1/admin/orders/${order.id}/shipments`, { carrier: 'Delhivery', trackingNumber: 'T1234' });
    expect(sh.status, JSON.stringify(sh.body)).toBe(201);
    const ret = await cust.post(`/api/v1/me/orders/${order.number}/return`, { lines: [{ variantId: p.variants[0]!.id, qty: 1 }], reason: 'Does not fit' });
    expect(ret.body).toMatchObject({ status: 'requested' });
    const list = (await mgr.get('/api/v1/admin/returns')).body.items;
    expect(list[0].status).toBe('requested');
    expect((await mgr.patch(`/api/v1/admin/returns/${list[0].id}`, { status: 'approved', note: 'ok' })).status).toBe(200);

    const del = await cust.post('/api/v1/me/delete-request');
    expect(del.status).toBe(200);
    const customers = (await mgr.get('/api/v1/admin/customers')).body.items;
    expect(customers[0].deletionRequestedAt).toBeTruthy();
    expect((await mgr.post(`/api/v1/admin/customers/${customers[0].id}/anonymize`)).status).toBe(403); // admin only
    expect((await admin.post(`/api/v1/admin/customers/${customers[0].id}/anonymize`)).status).toBe(200);
    expect((await admin.get('/api/v1/admin/customers')).body.items[0].email).toMatch(/^deleted\+/);
  });

  it('reports summarise paid revenue only', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    await paidOrder();
    const p2 = await makeProduct({ stock: 5 });
    await request(t.app).post('/api/v1/checkout').send(checkoutBody(p2)); // unpaid
    const r = (await mgr.get('/api/v1/admin/reports/summary?days=7')).body;
    expect(r.orders).toBe(1);
    expect(r.revenue).toBe(799900);
    expect(r.topProducts[0].units).toBe(1);
  });
});

describe('content', () => {
  it('sanitises article HTML and only serves published articles', async () => {
    const editor = await sessionFor(t.app, 'content');
    const created = await editor.post('/api/v1/admin/articles', { title: 'Leather care', body: '<h1>Care</h1><p onclick="x()">Keep dry<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a>', status: 'published' });
    expect(created.status).toBe(201);
    const a = await request(t.app).get('/api/v1/articles/leather-care');
    expect(a.status).toBe(200);
    expect(a.body.body).not.toMatch(/script|onclick|javascript:/i);
    expect(a.body.body).toContain('<h2>Care</h2>');
    await editor.post('/api/v1/admin/articles', { title: 'Secret draft', body: 'x', status: 'draft' });
    expect((await request(t.app).get('/api/v1/articles/secret-draft')).status).toBe(404);
  });

  it('settings are admin-only and validated', async () => {
    const admin = await sessionFor(t.app, 'admin');
    const cur = (await admin.get('/api/v1/admin/settings')).body;
    const bad = await admin.put('/api/v1/admin/settings', { ...cur, shipping: { ...cur.shipping, flatRate: -5 } });
    expect(bad.status).toBe(400);
    const ok = await admin.put('/api/v1/admin/settings', { ...cur, returns: { windowDays: 10, summary: 'Confirmed by owner' } });
    expect(ok.status).toBe(200);
    expect((await request(t.app).get('/api/v1/settings/public')).body.returns.windowDays).toBe(10);
  });
});
