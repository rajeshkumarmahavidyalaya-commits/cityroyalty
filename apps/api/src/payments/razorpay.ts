import { createHmac } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/auth';
import { badRequest, HttpError } from '../lib/errors';
import type { PaymentAdapter } from './types';

const API = 'https://api.razorpay.com/v1';

export function createRazorpay(config: Config, fetchImpl: typeof fetch = fetch): PaymentAdapter {
  const keyId = config.RAZORPAY_KEY_ID!;
  const secret = config.RAZORPAY_KEY_SECRET!;
  const auth = 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64');

  async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) throw new HttpError(502, 'payment_provider_error', json.error?.description ?? 'Payment provider error');
    return json;
  }

  return {
    name: 'razorpay',
    async createPayment(req) {
      const order = await call<{ id: string }>('/orders', {
        method: 'POST',
        body: { amount: req.amount, currency: req.currency, receipt: req.orderNumber, notes: { orderNumber: req.orderNumber } },
      });
      return {
        providerOrderId: order.id,
        client: {
          provider: 'razorpay',
          keyId,
          orderId: order.id,
          amount: req.amount,
          currency: req.currency,
          name: 'City Royalty',
          prefill: { name: req.name, email: req.email, contact: req.phone },
        },
      };
    },
    async verifyClientPayment({ providerOrderId, payload }) {
      const { razorpay_payment_id: pid, razorpay_signature: sig, razorpay_order_id: oid } = payload;
      if (!pid || !sig || oid !== providerOrderId) throw badRequest('Incomplete payment confirmation');
      const expected = createHmac('sha256', secret).update(`${providerOrderId}|${pid}`).digest('hex');
      if (!safeEqual(expected, sig)) throw badRequest('Payment signature mismatch', undefined, 'bad_signature');
      // never trust the browser for status/amount: confirm with Razorpay
      let p = await call<{ status: string; amount: number; error_description?: string }>(`/payments/${pid}`);
      if (p.status === 'authorized') {
        p = await call(`/payments/${pid}/capture`, { method: 'POST', body: { amount: p.amount, currency: 'INR' } });
      }
      if (p.status === 'captured') return { status: 'paid', providerPaymentId: pid, amount: p.amount };
      if (p.status === 'failed') return { status: 'failed', providerPaymentId: pid, reason: p.error_description };
      return { status: 'pending', providerPaymentId: pid };
    },
    parseWebhook(raw, headers) {
      const whSecret = config.RAZORPAY_WEBHOOK_SECRET;
      const sig = String(headers['x-razorpay-signature'] ?? '');
      if (!whSecret) throw new HttpError(503, 'webhook_not_configured', 'Razorpay webhook secret is not configured');
      const expected = createHmac('sha256', whSecret).update(raw).digest('hex');
      if (!sig || !safeEqual(expected, sig)) throw new HttpError(400, 'bad_signature', 'Invalid webhook signature');
      const body = JSON.parse(raw.toString('utf8')) as {
        event: string;
        payload?: { payment?: { entity?: { id: string; order_id?: string; amount?: number; error_description?: string } } };
      };
      const eventId = String(headers['x-razorpay-event-id'] ?? '');
      if (!eventId) throw new HttpError(400, 'missing_event_id', 'Missing event id');
      const e = body.payload?.payment?.entity;
      const base = { eventId, type: body.event, providerOrderId: e?.order_id, providerPaymentId: e?.id, amount: e?.amount };
      if (body.event === 'payment.captured' || body.event === 'order.paid') return { ...base, outcome: 'paid' };
      if (body.event === 'payment.failed') return { ...base, outcome: 'failed', reason: e?.error_description };
      return { ...base, outcome: 'ignored' };
    },
    async refund({ providerPaymentId, amount, reason }) {
      const r = await call<{ id: string }>(`/payments/${providerPaymentId}/refund`, { method: 'POST', body: { amount, notes: { reason } } });
      return { providerRefundId: r.id };
    },
  };
}
