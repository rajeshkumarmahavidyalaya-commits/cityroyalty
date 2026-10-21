import { createHmac } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/auth';
import { badRequest, HttpError } from '../lib/errors';
import type { PaymentAdapter } from './types';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_S = 300;

export function createStripe(config: Config, fetchImpl: typeof fetch = fetch): PaymentAdapter {
  const sk = config.STRIPE_SECRET_KEY!;

  async function call<T>(path: string, form?: Record<string, string>): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, {
      method: form ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${sk}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new HttpError(502, 'payment_provider_error', json.error?.message ?? 'Payment provider error');
    return json;
  }

  return {
    name: 'stripe',
    async createPayment(req) {
      const pi = await call<{ id: string; client_secret: string }>('/payment_intents', {
        amount: String(req.amount),
        currency: req.currency.toLowerCase(),
        receipt_email: req.email,
        'automatic_payment_methods[enabled]': 'true',
        'metadata[orderNumber]': req.orderNumber,
      });
      return { providerOrderId: pi.id, client: { provider: 'stripe', clientSecret: pi.client_secret, publishableKey: config.STRIPE_PUBLISHABLE_KEY! } };
    },
    async verifyClientPayment({ providerOrderId }) {
      const pi = await call<{ status: string; amount_received: number; last_payment_error?: { message?: string } }>(`/payment_intents/${providerOrderId}`);
      if (pi.status === 'succeeded') return { status: 'paid', providerPaymentId: providerOrderId, amount: pi.amount_received };
      if (pi.status === 'requires_payment_method' && pi.last_payment_error) return { status: 'failed', reason: pi.last_payment_error.message };
      return { status: 'pending' };
    },
    parseWebhook(raw, headers) {
      const secret = config.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new HttpError(503, 'webhook_not_configured', 'Stripe webhook secret is not configured');
      const header = String(headers['stripe-signature'] ?? '');
      const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
      const t = Number(parts.t);
      if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) throw new HttpError(400, 'bad_signature', 'Invalid webhook signature');
      const expected = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
      if (!safeEqual(expected, parts.v1)) throw new HttpError(400, 'bad_signature', 'Invalid webhook signature');
      const ev = JSON.parse(raw.toString('utf8')) as {
        id: string;
        type: string;
        data?: { object?: { id: string; amount_received?: number; amount?: number; last_payment_error?: { message?: string } } };
      };
      const o = ev.data?.object;
      const base = { eventId: ev.id, type: ev.type, providerOrderId: o?.id, providerPaymentId: o?.id, amount: o?.amount_received ?? o?.amount };
      if (ev.type === 'payment_intent.succeeded') return { ...base, outcome: 'paid' };
      if (ev.type === 'payment_intent.payment_failed') return { ...base, outcome: 'failed', reason: o?.last_payment_error?.message };
      return { ...base, outcome: 'ignored' };
    },
    async refund({ providerPaymentId, amount, reason }) {
      if (!providerPaymentId) throw badRequest('Missing payment reference');
      const r = await call<{ id: string }>('/refunds', { payment_intent: providerPaymentId, amount: String(amount), 'metadata[reason]': reason });
      return { providerRefundId: r.id };
    },
  };
}
