import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { db } from '../db';
import { paymentEvents, payments } from '../db/schema';
import { HttpError } from '../lib/errors';
import { wrap } from '../lib/http';
import { logger } from '../logger';
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
    const ev = getAdapter(adapters, provider).parseWebhook(req.body as Buffer, req.headers); // throws 400 on bad signature

    await db().insert(paymentEvents).values({ provider, eventId: ev.eventId, type: ev.type }).onConflictDoNothing();
    const [ledger] = await db().select().from(paymentEvents).where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.eventId, ev.eventId)));
    if (ledger?.processed) return void res.json({ ok: true, duplicate: true });

    let result = 'ignored';
    if (ev.outcome !== 'ignored' && ev.providerOrderId) {
      const [payment] = await db().select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerOrderId, ev.providerOrderId)));
      if (!payment) result = 'unknown_payment';
      else if (ev.outcome === 'paid') result = (await orders.markPaid(payment.orderId, { providerPaymentId: ev.providerPaymentId, amount: ev.amount, via: `${provider}-webhook` })).changed ? 'paid' : 'noop';
      else result = (await orders.markFailed(payment.orderId, ev.reason)).changed ? 'failed' : 'noop';
    }
    await db().update(paymentEvents).set({ processed: true, result }).where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.eventId, ev.eventId)));
    logger.info({ provider, event: ev.eventId, type: ev.type, result }, 'webhook processed');
    res.json({ ok: true, result });
  }));
  return r;
}
