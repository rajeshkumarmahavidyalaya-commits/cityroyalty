import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { paymentEvents, orders, products } from '../src/db/schema';
import { loadProduct } from '../src/services/products';
import { addDiscount, address, checkoutBody, count, discount, expireOrder, firstOrder, makeCollection, makeProduct, orderById, orderByNumber, paymentByProviderOrder, sessionFor, startTestApp, stockOf } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(async () => {
  await t.reset();
  await makeCollection();
});

const sign = (body: object) => createHmac('sha256', 'whsec_test').update(JSON.stringify(body)).digest('hex');
const webhook = (body: object, sig = sign(body)) =>
  request(t.app).post('/api/v1/webhooks/mock').set('content-type', 'application/json').set('x-mock-signature', sig).send(JSON.stringify(body));

describe('pricing', () => {
  it('prices a cart on the server and ignores client-supplied prices', async () => {
    const p = await makeProduct({ price: 799900 });
    const res = await request(t.app).post('/api/v1/cart/price').send({
      lines: [{ productId: p.id, variantId: p.variants[0]!.id, qty: 2, price: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe(1599800);
    expect(res.body.shipping).toBe(0); // above the free-shipping threshold (₹600)
    expect(res.body.total).toBe(1599800);
    expect(res.body.ok).toBe(true);
  });

  it('charges the flat rate below the threshold and flags unknown shipping instead of guessing', async () => {
    const cheap = await makeProduct({ price: 49900 });
    const line = [{ productId: cheap.id, variantId: cheap.variants[0]!.id, qty: 1 }];
    expect((await request(t.app).post('/api/v1/cart/price').send({ lines: line })).body.shipping).toBe(9900);
    const { saveSettings, DEFAULT_SETTINGS } = await import('../src/lib/settings');
    await saveSettings({ ...DEFAULT_SETTINGS, shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: null } });
    const res = await request(t.app).post('/api/v1/cart/price').send({ lines: line });
    expect(res.body.shipping).toBeNull();
    expect(res.body.ok).toBe(false);
  });

  it('flags insufficient / unavailable stock and unknown stock', async () => {
    const low = await makeProduct({ stock: 1 });
    const unknown = await makeProduct({ stock: null });
    const a = await request(t.app).post('/api/v1/cart/price').send({ lines: [{ productId: low.id, variantId: low.variants[0]!.id, qty: 3 }] });
    expect(a.body.lines[0].issue).toBe('insufficient_stock');
    expect(a.body.ok).toBe(false);
    const b = await request(t.app).post('/api/v1/cart/price').send({ lines: [{ productId: unknown.id, variantId: unknown.variants[0]!.id, qty: 1 }] });
    expect(b.body.lines[0].issue).toBe('unavailable');
  });

  it('does not sell unpublished products', async () => {
    const d = await makeProduct({ status: 'draft' });
    const res = await request(t.app).post('/api/v1/cart/price').send({ lines: [{ productId: d.id, variantId: d.variants[0]!.id, qty: 1 }] });
    expect(res.body.ok).toBe(false);
    expect(res.body.lines[0].issue).toBe('removed');
  });

  it('applies percent, fixed and free-shipping codes with their rules', async () => {
    const p = await makeProduct({ price: 50000 });
    const line = [{ productId: p.id, variantId: p.variants[0]!.id, qty: 1 }];
    await addDiscount({ code: 'TEN', type: 'percent', value: 10 });
    await addDiscount({ code: 'FREESHIP', type: 'free_shipping' });
    await addDiscount({ code: 'BIG', type: 'fixed', value: 5000, minSubtotal: 100000 });
    await addDiscount({ code: 'OLD', type: 'percent', value: 10, endsAt: new Date(Date.now() - 1000) });
    const ten = await request(t.app).post('/api/v1/cart/price').send({ lines: line, discountCode: 'ten' });
    expect(ten.body.discount.amount).toBe(5000);
    expect(ten.body.total).toBe(45000 + 9900); // ₹500 is under the free-shipping threshold
    const free = await request(t.app).post('/api/v1/cart/price').send({ lines: [{ ...line[0], qty: 1 }], discountCode: 'FREESHIP' });
    expect(free.body.shipping).toBe(0); // 500 is under the ₹600 threshold, code waives it
    expect((await request(t.app).post('/api/v1/cart/price').send({ lines: line, discountCode: 'BIG' })).body.discountError).toBeTruthy();
    expect((await request(t.app).post('/api/v1/cart/price').send({ lines: line, discountCode: 'OLD' })).body.discountError).toMatch(/expired/);
    expect((await request(t.app).post('/api/v1/cart/price').send({ lines: line, discountCode: 'NOPE' })).body.discountError).toBeTruthy();
  });
});

describe('checkout & payment', () => {
  it('creates an order, reserves stock, and confirms after a verified payment', async () => {
    const p = await makeProduct({ stock: 5 });
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { subscribe: true }));
    expect(res.status).toBe(201);
    expect(res.body.payment.provider).toBe('mock');
    expect(res.body.order.total).toBe(799900);
    expect(await stockOf(p.id)).toBe(4);
    const order = await orderByNumber(res.body.order.number);
    expect(order!.status).toBe('pending_payment');

    const verify = await request(t.app).post('/api/v1/checkout/verify').send({
      orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'success', amount: '799900' },
    });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('paid');
    expect((await orderById(order!.id))!.status).toBe('paid');
    expect(await stockOf(p.id)).toBe(4); // not deducted twice
    expect(t.deps.mailer.outbox.filter((m) => m.subject.includes('confirmed'))).toHaveLength(1);

    // verifying again is a no-op: no second email, no second deduction
    await request(t.app).post('/api/v1/checkout/verify').send({
      orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'success' },
    }).expect(200);
    expect(t.deps.mailer.outbox.filter((m) => m.subject.includes('confirmed'))).toHaveLength(1);
  });

  it('rejects a wrong access token', async () => {
    const p = await makeProduct();
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p));
    const bad = await request(t.app).post('/api/v1/checkout/verify').send({ orderNumber: res.body.order.number, accessToken: 'x'.repeat(20), provider: 'mock', payload: { result: 'success' } });
    expect(bad.status).toBe(403);
  });

  it('never oversells: 6 concurrent buyers of the last 3 units → exactly 3 succeed', async () => {
    const p = await makeProduct({ stock: 3, sizes: ['M-44'] });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { email: `b${i}@t.test` }))),
    );
    const ok = results.filter((r) => r.status === 201);
    const bad = results.filter((r) => r.status !== 201);
    expect(ok).toHaveLength(3);
    expect(bad.every((r) => r.status === 409 && ['insufficient_stock', 'cart_invalid'].includes(r.body.error.code))).toBe(true);
    expect(await stockOf(p.id)).toBe(0);
    expect((await loadProduct(p.id))!.available).toBe(false);
  });

  it('is idempotent on the client key (double click creates one order, one deduction)', async () => {
    const p = await makeProduct({ stock: 5 });
    const body = checkoutBody(p, { idempotencyKey: 'same-key-1234567890' });
    const [a, b] = await Promise.all([request(t.app).post('/api/v1/checkout').send(body), request(t.app).post('/api/v1/checkout').send(body)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201);
    expect(await count(orders)).toBe(1);
    expect(await stockOf(p.id)).toBe(4);
    const again = await request(t.app).post('/api/v1/checkout').send(body);
    expect(again.status).toBe(201);
    expect(again.body.order.number).toBe((await firstOrder()).number);
  });

  it('failed payment releases stock + discount and supports recovery via retry', async () => {
    const p = await makeProduct({ stock: 2 });
    await addDiscount({ code: 'ONCE', type: 'percent', value: 10, maxUses: 1 });
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { discountCode: 'ONCE' }));
    expect(res.status).toBe(201);
    expect(await stockOf(p.id)).toBe(1);
    expect((await discount('ONCE')).usedCount).toBe(1);

    const fail = await request(t.app).post('/api/v1/checkout/verify').send({ orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'fail' } });
    expect(fail.body.status).toBe('failed');
    expect(await stockOf(p.id)).toBe(2);
    expect((await discount('ONCE')).usedCount).toBe(0);
    expect(t.deps.mailer.outbox.some((m) => m.subject.includes('didn’t go through'))).toBe(true);

    const retry = await request(t.app).post('/api/v1/checkout/retry').send({ orderNumber: res.body.order.number, accessToken: res.body.order.accessToken });
    expect(retry.status).toBe(200);
    expect(await stockOf(p.id)).toBe(1);
    const ok = await request(t.app).post('/api/v1/checkout/verify').send({ orderNumber: res.body.order.number, accessToken: res.body.order.accessToken, provider: 'mock', payload: { result: 'success' } });
    expect(ok.body.status).toBe('paid');
  });

  it('single-use discount cannot be redeemed twice concurrently', async () => {
    const p = await makeProduct({ stock: 10 });
    await addDiscount({ code: 'ONCE', type: 'percent', value: 10, maxUses: 1 });
    const rs = await Promise.all([1, 2, 3].map((i) => request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { discountCode: 'ONCE', email: `d${i}@t.test` }))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await stockOf(p.id)).toBe(9); // losers rolled their stock back
  });

  it('expires abandoned payments and frees the stock', async () => {
    const p = await makeProduct({ stock: 2 });
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p));
    expect(await stockOf(p.id)).toBe(1);
    await expireOrder(res.body.order.number);
    expect(await t.deps.orders.expireStale()).toBe(1);
    expect(await stockOf(p.id)).toBe(2);
    expect((await orderByNumber(res.body.order.number))!.status).toBe('payment_failed');
    expect(await t.deps.orders.expireStale()).toBe(0);
  });

  it('refuses COD unless enabled, and mock in production config', async () => {
    const p = await makeProduct();
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { provider: 'cod' }));
    expect(res.status).toBe(400);
    const { loadConfig } = await import('../src/config');
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), PAYMENT_MOCK_ENABLED: 'true' } as NodeJS.ProcessEnv)).toThrow(/MOCK/);
    expect(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it('validates the delivery address (PIN, phone)', async () => {
    const p = await makeProduct();
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { shippingAddress: { ...address, pin: '12' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: { path: string }) => d.path.includes('pin'))).toBe(true);
  });
});

describe('webhooks (idempotent)', () => {
  async function pending() {
    const p = await makeProduct({ stock: 3 });
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p));
    const payment = await paymentByProviderOrder(res.body.payment.mockPaymentId);
    return { p, res, providerOrderId: payment!.providerOrderId! };
  }

  it('rejects a bad signature', async () => {
    const { providerOrderId } = await pending();
    const r = await webhook({ id: 'evt_1', type: 'payment.succeeded', providerOrderId, amount: 799900 }, 'deadbeef');
    expect(r.status).toBe(400);
  });

  it('processes a success event once, however many times it is delivered', async () => {
    const { p, res, providerOrderId } = await pending();
    const ev = { id: 'evt_dup', type: 'payment.succeeded', providerOrderId, amount: 799900 };
    const results = await Promise.all([webhook(ev), webhook(ev), webhook(ev)]);
    results.forEach((r) => expect(r.status).toBe(200));
    expect((await orderByNumber(res.body.order.number))!.status).toBe('paid');
    expect(await stockOf(p.id)).toBe(2);
    expect(await count(paymentEvents, eq(paymentEvents.eventId, 'evt_dup'))).toBe(1);
    expect(t.deps.mailer.outbox.filter((m) => m.subject.includes('confirmed'))).toHaveLength(1);
    // a different event id for the same payment (provider retry with new id) is also a no-op
    await webhook({ ...ev, id: 'evt_dup2' }).expect(200);
    expect(t.deps.mailer.outbox.filter((m) => m.subject.includes('confirmed'))).toHaveLength(1);
  });

  it('does not accept a payment whose amount differs from the order total', async () => {
    const { res, providerOrderId } = await pending();
    await webhook({ id: 'evt_short', type: 'payment.succeeded', providerOrderId, amount: 100 }).expect(200);
    const o = await orderByNumber(res.body.order.number);
    expect(o!.status).toBe('pending_payment');
    expect(o!.flags).toContain('amount_mismatch');
  });

  it('a failure webhook after a success never un-pays an order', async () => {
    const { res, providerOrderId } = await pending();
    await webhook({ id: 'e1', type: 'payment.succeeded', providerOrderId, amount: 799900 }).expect(200);
    await webhook({ id: 'e2', type: 'payment.failed', providerOrderId, reason: 'late' }).expect(200);
    expect((await orderByNumber(res.body.order.number))!.status).toBe('paid');
  });

  it('a late success for an expired hold re-takes stock (or flags a conflict)', async () => {
    const { p, res, providerOrderId } = await pending();
    await expireOrder(res.body.order.number);
    await t.deps.orders.expireStale();
    expect(await stockOf(p.id)).toBe(3);
    await webhook({ id: 'late', type: 'payment.succeeded', providerOrderId, amount: 799900 }).expect(200);
    expect((await orderByNumber(res.body.order.number))!.status).toBe('paid');
    expect(await stockOf(p.id)).toBe(2);
  });
});

describe('customer order access', () => {
  it('lets a guest track by number + email only, with a uniform not-found', async () => {
    const p = await makeProduct();
    const res = await request(t.app).post('/api/v1/checkout').send(checkoutBody(p, { email: 'guest@t.test' }));
    const ok = await request(t.app).post('/api/v1/orders/track').send({ orderNumber: res.body.order.number, email: 'guest@t.test' });
    expect(ok.status).toBe(200);
    expect(ok.body.lines[0].title).toBe('Test Biker Jacket');
    const wrong = await request(t.app).post('/api/v1/orders/track').send({ orderNumber: res.body.order.number, email: 'other@t.test' });
    expect(wrong.status).toBe(404);
  });

  it('shows signed-in customers only their own orders', async () => {
    const p = await makeProduct({ stock: 9 });
    const a = await sessionFor(t.app, 'customer', 'a@t.test');
    const b = await sessionFor(t.app, 'customer', 'b@t.test');
    const o = await a.post('/api/v1/checkout', checkoutBody(p, { email: 'a@t.test' }));
    expect(o.status).toBe(201);
    expect((await a.get('/api/v1/me/orders')).body.items).toHaveLength(1);
    expect((await b.get('/api/v1/me/orders')).body.items).toHaveLength(0);
    expect((await b.get(`/api/v1/me/orders/${o.body.order.number}`)).status).toBe(404);
  });
});
