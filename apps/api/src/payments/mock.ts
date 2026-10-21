import { createHmac, randomUUID } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/auth';
import { HttpError } from '../lib/errors';
import type { PaymentAdapter } from './types';

/**
 * Development/test provider. It never talks to a network and is refused in production by config.
 * The "browser" confirms with payload.result = success | fail; the webhook is HMAC signed with MOCK_WEBHOOK_SECRET.
 */
export function createMock(config: Config): PaymentAdapter {
  const secret = config.MOCK_WEBHOOK_SECRET ?? 'mock-webhook-secret';
  return {
    name: 'mock',
    async createPayment() {
      const id = `mock_${randomUUID()}`;
      return { providerOrderId: id, client: { provider: 'mock', mockPaymentId: id } };
    },
    async verifyClientPayment({ providerOrderId, payload }) {
      if (payload.result === 'success') return { status: 'paid', providerPaymentId: `pay_${providerOrderId}`, amount: payload.amount ? Number(payload.amount) : undefined };
      if (payload.result === 'fail') return { status: 'failed', reason: 'Declined (mock)' };
      return { status: 'pending' };
    },
    parseWebhook(raw, headers) {
      const sig = String(headers['x-mock-signature'] ?? '');
      const expected = createHmac('sha256', secret).update(raw).digest('hex');
      if (!sig || !safeEqual(expected, sig)) throw new HttpError(400, 'bad_signature', 'Invalid webhook signature');
      const b = JSON.parse(raw.toString('utf8')) as { id: string; type: string; providerOrderId: string; amount?: number; reason?: string };
      const base = { eventId: b.id, type: b.type, providerOrderId: b.providerOrderId, providerPaymentId: `pay_${b.providerOrderId}`, amount: b.amount };
      if (b.type === 'payment.succeeded') return { ...base, outcome: 'paid' };
      if (b.type === 'payment.failed') return { ...base, outcome: 'failed', reason: b.reason };
      return { ...base, outcome: 'ignored' };
    },
    async refund({ providerPaymentId }) {
      return { providerRefundId: `rf_${providerPaymentId}` };
    },
  };
}
export const signMockWebhook = (body: string, secret = 'mock-webhook-secret') => createHmac('sha256', secret).update(body).digest('hex');
