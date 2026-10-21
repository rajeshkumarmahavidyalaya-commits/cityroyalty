import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createRazorpay } from '../src/payments/razorpay';
import { createStripe } from '../src/payments/stripe';

const config = loadConfig({
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'rzp_secret', RAZORPAY_WEBHOOK_SECRET: 'rzp_wh',
  STRIPE_SECRET_KEY: 'sk_test', STRIPE_PUBLISHABLE_KEY: 'pk_test', STRIPE_WEBHOOK_SECRET: 'whsec',
} as NodeJS.ProcessEnv);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Razorpay adapter', () => {
  it('creates an order with the server-computed amount and returns only public params', async () => {
    const f = vi.fn(async () => json({ id: 'order_ABC' })) as unknown as typeof fetch;
    const a = createRazorpay(config, f);
    const out = await a.createPayment({ orderNumber: 'CR-100001', amount: 799900, currency: 'INR', email: 'a@b.com', name: 'A', phone: '9876543210' });
    expect(out.providerOrderId).toBe('order_ABC');
    expect(out.client).toMatchObject({ provider: 'razorpay', keyId: 'rzp_test_key', amount: 799900 });
    expect(JSON.stringify(out.client)).not.toContain('rzp_secret');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(JSON.parse(call[1].body as string)).toMatchObject({ amount: 799900, currency: 'INR', receipt: 'CR-100001' });
  });

  it('verifies the client signature, then confirms status with Razorpay (captures authorised payments)', async () => {
    const sig = createHmac('sha256', 'rzp_secret').update('order_ABC|pay_1').digest('hex');
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ status: 'authorized', amount: 799900 }))
      .mockResolvedValueOnce(json({ status: 'captured', amount: 799900 })) as unknown as typeof fetch;
    const a = createRazorpay(config, f);
    const r = await a.verifyClientPayment({ providerOrderId: 'order_ABC', payload: { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_ABC', razorpay_signature: sig } });
    expect(r).toEqual({ status: 'paid', providerPaymentId: 'pay_1', amount: 799900 });
    await expect(a.verifyClientPayment({ providerOrderId: 'order_ABC', payload: { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_ABC', razorpay_signature: 'bad' } })).rejects.toThrow(/signature/i);
  });

  it('validates webhook signatures over the raw body', () => {
    const a = createRazorpay(config, vi.fn() as unknown as typeof fetch);
    const raw = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_ABC', amount: 799900 } } } }));
    const sig = createHmac('sha256', 'rzp_wh').update(raw).digest('hex');
    const ev = a.parseWebhook(raw, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' });
    expect(ev).toMatchObject({ eventId: 'evt_1', outcome: 'paid', providerOrderId: 'order_ABC', amount: 799900 });
    expect(() => a.parseWebhook(raw, { 'x-razorpay-signature': 'nope', 'x-razorpay-event-id': 'evt_1' })).toThrow(/signature/i);
    expect(() => a.parseWebhook(Buffer.from(raw.toString() + ' '), { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' })).toThrow(/signature/i);
  });
});

describe('Stripe adapter', () => {
  it('verifies the timestamped signature and rejects replays outside the tolerance', () => {
    const a = createStripe(config, vi.fn() as unknown as typeof fetch);
    const body = JSON.stringify({ id: 'evt_s1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 500000 } } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex');
    expect(a.parseWebhook(Buffer.from(body), { 'stripe-signature': `t=${t},v1=${v1}` })).toMatchObject({ eventId: 'evt_s1', outcome: 'paid', amount: 500000 });
    const old = t - 3600;
    const v1old = createHmac('sha256', 'whsec').update(`${old}.${body}`).digest('hex');
    expect(() => a.parseWebhook(Buffer.from(body), { 'stripe-signature': `t=${old},v1=${v1old}` })).toThrow();
    expect(() => a.parseWebhook(Buffer.from(body), { 'stripe-signature': `t=${t},v1=deadbeef` })).toThrow();
  });
});
