import { Router } from 'express';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { HttpError } from '../lib/errors';
import { wrap } from '../lib/http';
import { logger } from '../logger';
import { Payment, PaymentEvent } from '../models';
import { getAdapter } from '../payments';

/**
 * Provider webhooks. Mounted with express.raw() BEFORE the JSON parser (signatures cover the raw bytes).
 * Idempotency: (provider, eventId) is unique; a replayed event is acknowledged and ignored, a previously
 * *failed* attempt (processed=false) is retried, so a crash mid-way never loses a payment.
 */
export function webhookRoutes({ adapters, orders }: Deps) {
  const r = Router();
  r.post('/:provider', wrap(async (req, res) => {
    const provider = String(req.params.provider) as PaymentProvider;
    if (!PAYMENT_PROVIDERS.includes(provider) || provider === 'cod') throw new HttpError(404, 'not_found', 'Unknown provider');
    const adapter = getAdapter(adapters, provider);
    const raw = req.body as Buffer;
    const ev = adapter.parseWebhook(raw, req.headers); // throws 400 on bad signature

    const ledger = await PaymentEvent.findOneAndUpdate(
      { provider, eventId: ev.eventId },
      { $setOnInsert: { provider, eventId: ev.eventId, type: ev.type, processed: false } },
      { upsert: true, returnDocument: 'before' },
    );
    if (ledger?.processed) return res.json({ ok: true, duplicate: true });

    let result = 'ignored';
    if (ev.outcome !== 'ignored' && ev.providerOrderId) {
      const payment = await Payment.findOne({ provider, providerOrderId: ev.providerOrderId });
      if (!payment) result = 'unknown_payment';
      else if (ev.outcome === 'paid') {
        const o = await orders.markPaid(payment.orderId, { providerPaymentId: ev.providerPaymentId, amount: ev.amount, via: `${provider}-webhook` });
        result = o.changed ? 'paid' : 'noop';
      } else {
        const o = await orders.markFailed(payment.orderId, ev.reason);
        result = o.changed ? 'failed' : 'noop';
      }
    }
    await PaymentEvent.updateOne({ provider, eventId: ev.eventId }, { $set: { processed: true, result } });
    logger.info({ provider, event: ev.eventId, type: ev.type, result }, 'webhook processed');
    res.json({ ok: true, result });
  }));
  return r;
}
