import { createHmac } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { formatMoney, type CheckoutInput, type CheckoutResultDTO, type OrderDTO, type OrderStatus, type PaymentProvider } from '@cityroyalty/shared';
import type { Config } from '../config';
import { db, type DbOrTx } from '../db';
import { discounts, orderLines, orders, payments, shipments, type OrderLineRow, type OrderRow, type ShipmentRow, type TimelineEntry } from '../db/schema';
import { safeEqual } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { escapeHtml, layout, type Mailer } from '../lib/mailer';
import { getSettings } from '../lib/settings';
import { logger } from '../logger';
import { getAdapter, type PaymentAdapters } from '../payments';
import { reserveStock, restoreStock, type StockLine } from './inventory';
import { priceCart } from './pricing';

const RESERVATION_MINUTES = 30;

export type OrderService = ReturnType<typeof createOrderService>;
export type OrderWithLines = OrderRow & { lines: OrderLineRow[] };

export function toOrderDTO(o: OrderWithLines, ships: ShipmentRow[] = []): OrderDTO {
  const a = o.shippingAddress;
  return {
    id: o.id,
    number: o.number,
    email: o.email,
    status: o.status as OrderDTO['status'],
    paymentStatus: o.paymentStatus as OrderDTO['paymentStatus'],
    provider: o.provider as OrderDTO['provider'],
    lines: o.lines.map((l) => ({ variantId: l.variantId, title: l.title, sku: l.sku ?? '', optionsLabel: l.optionsLabel, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, image: l.image ?? undefined })),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    discountCode: o.discountCode ?? undefined,
    shippingTotal: o.shippingTotal,
    total: o.total,
    shippingAddress: { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, pin: a.pin, country: a.country ?? 'IN' },
    shipments: ships.map((s) => ({ id: s.id, carrier: s.carrier, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl ?? undefined, status: s.status as OrderDTO['shipments'][number]['status'], createdAt: s.createdAt.toISOString() })),
    timeline: o.timeline.map((t) => ({ at: t.at, status: t.status, note: t.note })),
    createdAt: o.createdAt.toISOString(),
    reservationExpiresAt: o.reservationExpiresAt ? o.reservationExpiresAt.toISOString() : undefined,
  };
}

export async function withLines(rows: OrderRow[], tx: DbOrTx = db()): Promise<OrderWithLines[]> {
  if (!rows.length) return [];
  const ls = await tx.select().from(orderLines).where(inArray(orderLines.orderId, rows.map((r) => r.id))).orderBy(asc(orderLines.position));
  return rows.map((r) => ({ ...r, lines: ls.filter((l) => l.orderId === r.id) }));
}
export async function loadOrder(where: { id?: string; number?: string }, tx: DbOrTx = db()): Promise<OrderWithLines | null> {
  const cond = where.id ? eq(orders.id, where.id) : eq(orders.number, where.number!);
  const [row] = await tx.select().from(orders).where(cond);
  return row ? ((await withLines([row], tx))[0] ?? null) : null;
}
export const shipmentsFor = (orderId: string) => db().select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt));

const entry = (status: string, note?: string, by = 'system'): TimelineEntry => ({ at: new Date().toISOString(), status, ...(note ? { note } : {}), by });
const push = (e: TimelineEntry) => sql`${orders.timeline} || ${JSON.stringify([e])}::jsonb`;
const isUnique = (e: unknown, constraint?: string) => {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const code = err.code ?? err.cause?.code;
  const name = err.constraint_name ?? err.cause?.constraint_name ?? '';
  return code === '23505' && (!constraint || name.includes(constraint));
};

interface Deps {
  config: Config;
  adapters: PaymentAdapters;
  mailer: Mailer;
}

export function createOrderService({ config, adapters, mailer }: Deps) {
  /** Guest access token: derivable (so an idempotent replay can return it) but unforgeable without the server secret. */
  const tokenFor = (orderNumber: string) => createHmac('sha256', config.jwtSecret).update(`order-access:${orderNumber}`).digest('base64url');
  const tokenOk = (orderNumber: string, token: string) => safeEqual(tokenFor(orderNumber), token);
  const reservedLines = (o: OrderWithLines): StockLine[] => o.lines.filter((l) => l.reserved).map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, madeToOrder: false }));

  /* ---------------- emails ---------------- */
  async function sendConfirmation(o: OrderWithLines) {
    const rows = o.lines
      .map((l) => `<tr><td style="padding:8px 0">${escapeHtml(l.title)}<br><span style="color:#6b5a4c;font-size:12px">${escapeHtml(l.optionsLabel)} × ${l.qty}</span></td><td align="right">${formatMoney(l.lineTotal)}</td></tr>`)
      .join('');
    await mailer.send({
      to: o.email,
      subject: `Order ${o.number} confirmed — City Royalty`,
      text: `Thank you. Your order ${o.number} (${formatMoney(o.total)}) is confirmed.`,
      html: layout(
        `Thank you — order ${o.number}`,
        `<table width="100%" style="font-size:14px">${rows}<tr><td style="padding-top:12px;border-top:1px solid #D8C9B5"><b>Total</b></td><td align="right" style="padding-top:12px;border-top:1px solid #D8C9B5"><b>${formatMoney(o.total)}</b></td></tr></table>`,
        { label: 'Track your order', href: `${config.PUBLIC_WEB_URL}/track-order?order=${o.number}` },
      ),
    });
  }
  async function sendFailed(o: OrderRow) {
    await mailer.send({
      to: o.email,
      subject: `Your payment didn’t go through — ${o.number}`,
      text: `We couldn’t complete the payment for ${o.number}. You can try again from your bag.`,
      html: layout('Your payment didn’t go through', `<p>We couldn’t complete the payment for order <b>${o.number}</b>. Nothing has been charged. You can pick up where you left off.</p>`, {
        label: 'Complete your order',
        href: `${config.PUBLIC_WEB_URL}/checkout/failed?order=${o.number}&token=${encodeURIComponent(tokenFor(o.number))}`,
      }),
    });
  }
  async function sendShipped(o: OrderRow, s: { carrier: string; trackingNumber: string; trackingUrl?: string }) {
    await mailer.send({
      to: o.email,
      subject: `Your order ${o.number} is on its way`,
      text: `Shipped via ${s.carrier}, tracking ${s.trackingNumber}.`,
      html: layout('Your order is on its way', `<p>Order <b>${o.number}</b> has shipped with <b>${escapeHtml(s.carrier)}</b>.<br>Tracking number: <b>${escapeHtml(s.trackingNumber)}</b></p>`, s.trackingUrl ? { label: 'Track shipment', href: s.trackingUrl } : undefined),
    });
  }

  /* ---------------- holds ---------------- */
  /** Gives back the stock and discount use held by an order — each exactly once, whoever calls first. */
  async function releaseHolds(orderId: string): Promise<void> {
    await db().transaction(async (tx) => {
      const [o] = await tx.update(orders).set({ stockReserved: false }).where(and(eq(orders.id, orderId), eq(orders.stockReserved, true))).returning();
      if (o) {
        const [full] = await withLines([o], tx);
        await restoreStock(tx, reservedLines(full!));
      }
      const [d] = await tx.update(orders).set({ discountReserved: false }).where(and(eq(orders.id, orderId), eq(orders.discountReserved, true))).returning();
      if (d?.discountCode) await tx.update(discounts).set({ usedCount: sql`${discounts.usedCount} - 1` }).where(and(eq(discounts.code, d.discountCode), gt(discounts.usedCount, 0)));
    });
  }

  async function replay(o: OrderRow): Promise<CheckoutResultDTO> {
    const [pay] = await db().select().from(payments).where(eq(payments.orderId, o.id)).orderBy(desc(payments.createdAt)).limit(1);
    if (pay?.clientParams) return { order: { number: o.number, total: o.total, accessToken: tokenFor(o.number) }, payment: pay.clientParams as CheckoutResultDTO['payment'] };
    throw conflict('This order was already placed', 'duplicate_checkout', { orderNumber: o.number });
  }

  /* ---------------- checkout ---------------- */
  async function checkout(input: CheckoutInput, userId?: string): Promise<CheckoutResultDTO> {
    const settings = await getSettings();
    const [existing] = await db().select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
    if (existing) return replay(existing);

    const provider = input.provider;
    if (provider === 'cod' && !settings.shipping.codEnabled) throw badRequest('Cash on delivery is not available', undefined, 'provider_unavailable');
    const adapter = provider === 'cod' ? null : getAdapter(adapters, provider);

    const pr = await priceCart({ lines: input.lines, discountCode: input.discountCode }, settings, { cod: provider === 'cod' });
    if (!pr.priced.ok || pr.priced.total == null) throw conflict('Your bag changed. Please review it before paying.', 'cart_invalid', pr.priced);
    if (input.discountCode && !pr.discountRow) throw badRequest(pr.priced.discountError ?? 'Discount code is not valid', undefined, 'invalid_discount');
    const total = pr.priced.total;

    // discount use + stock + order row commit together or not at all
    let order: OrderWithLines;
    try {
      order = await db().transaction(async (tx) => {
        if (pr.discountRow) {
          const d = pr.discountRow;
          const r = await tx
            .update(discounts)
            .set({ usedCount: sql`${discounts.usedCount} + 1` })
            .where(and(eq(discounts.id, d.id), eq(discounts.active, true), sql`(${discounts.maxUses} is null or ${discounts.usedCount} < ${discounts.maxUses})`))
            .returning({ id: discounts.id });
          if (!r.length) throw badRequest('That code has been fully redeemed', undefined, 'invalid_discount');
        }
        await reserveStock(tx, pr.resolved.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, madeToOrder: l.madeToOrder })));
        const [{ seq }] = await tx.execute<{ seq: string }>(sql`select nextval('cr.order_number_seq')::text as seq`) as unknown as [{ seq: string }];
        const [o] = await tx
          .insert(orders)
          .values({
            number: `CR-${100000 + Number(seq)}`,
            userId: userId ?? null,
            email: input.email,
            status: provider === 'cod' ? 'processing' : 'pending_payment',
            paymentStatus: provider === 'cod' ? 'cod_pending' : 'pending',
            provider,
            subtotal: pr.priced.subtotal,
            discountTotal: pr.priced.discount?.amount ?? 0,
            discountCode: pr.priced.discount?.code ?? null,
            shippingTotal: pr.priced.shipping ?? 0,
            codFee: pr.codFee,
            total,
            shippingAddress: input.shippingAddress,
            billingAddress: input.billingSameAsShipping ? input.shippingAddress : (input.billingAddress ?? input.shippingAddress),
            notes: input.notes ?? null,
            stockReserved: true,
            discountReserved: Boolean(pr.discountRow),
            reservationExpiresAt: provider === 'cod' ? null : new Date(Date.now() + RESERVATION_MINUTES * 60_000),
            idempotencyKey: input.idempotencyKey,
            timeline: [entry(provider === 'cod' ? 'processing' : 'pending_payment', 'Order placed')],
          })
          .returning();
        const ls = await tx
          .insert(orderLines)
          .values(pr.resolved.map((l, i) => ({
            orderId: o!.id, productId: l.productId, variantId: l.variantId, title: l.title, slug: l.slug, sku: l.sku, optionsLabel: l.optionsLabel,
            image: l.image ?? null, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.unitPrice * l.qty, reserved: !l.madeToOrder, position: i,
          })))
          .returning();
        return { ...o!, lines: ls };
      });
    } catch (err) {
      // a concurrent request with the same idempotency key won the race → return that order
      if (isUnique(err, 'idempotency')) {
        const [o] = await db().select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
        if (o) return replay(o);
      }
      throw err;
    }

    try {
      let client: CheckoutResultDTO['payment'];
      if (!adapter) {
        client = { provider: 'cod' };
        await db().insert(payments).values({ orderId: order.id, provider, amount: total, status: 'cod_pending', clientParams: client });
        await sendConfirmation(order);
      } else {
        const created = await adapter.createPayment({ orderNumber: order.number, amount: total, currency: 'INR', email: order.email, name: input.shippingAddress.fullName, phone: input.shippingAddress.phone });
        client = created.client;
        await db().insert(payments).values({ orderId: order.id, provider, providerOrderId: created.providerOrderId, amount: total, status: 'pending', clientParams: client });
      }
      return { order: { number: order.number, total, accessToken: tokenFor(order.number) }, payment: client };
    } catch (err) {
      await releaseHolds(order.id);
      await db().update(orders).set({ status: 'cancelled', paymentStatus: 'failed', timeline: push(entry('cancelled', 'Could not start payment')) }).where(eq(orders.id, order.id));
      throw err;
    }
  }

  /* ---------------- payment outcomes (idempotent) ---------------- */
  async function markPaid(orderId: string, info: { providerPaymentId?: string; amount?: number; via: string }): Promise<{ changed: boolean; order: OrderWithLines | null }> {
    const order = await loadOrder({ id: orderId });
    if (!order) return { changed: false, order: null };
    if (info.amount != null && info.amount !== order.total) {
      logger.error({ order: order.number, expected: order.total, got: info.amount }, 'payment amount mismatch');
      await db()
        .update(orders)
        .set({ flags: sql`array(select distinct unnest(${orders.flags} || ARRAY['amount_mismatch']::text[]))`, timeline: push(entry(order.status, `Payment amount mismatch (${info.amount} vs ${order.total})`)) })
        .where(eq(orders.id, order.id));
      return { changed: false, order };
    }
    // only one caller can win this transition → no duplicate "paid", no double emails
    const [won] = await db()
      .update(orders)
      .set({ status: 'paid', paymentStatus: 'paid', paidAt: new Date(), reservationExpiresAt: null, updatedAt: new Date(), timeline: push(entry('paid', `Payment received (${info.via})`)) })
      .where(and(eq(orders.id, order.id), inArray(orders.status, ['pending_payment', 'payment_failed'])))
      .returning();
    if (!won) return { changed: false, order };
    await db().update(payments).set({ status: 'paid', providerPaymentId: info.providerPaymentId ?? null, updatedAt: new Date() }).where(eq(payments.orderId, order.id));

    // the hold may have expired before a late payment landed → take the stock again
    if (!won.stockReserved) {
      try {
        await db().transaction(async (tx) => {
          await reserveStock(tx, reservedLines(order));
          await tx.update(orders).set({ stockReserved: true }).where(eq(orders.id, order.id));
        });
      } catch {
        await db()
          .update(orders)
          .set({ flags: sql`array(select distinct unnest(${orders.flags} || ARRAY['stock_conflict']::text[]))`, timeline: push(entry('paid', 'Paid after the stock hold expired and stock ran out — needs manual action (refund or backorder)')) })
          .where(eq(orders.id, order.id));
      }
    }
    const fresh = (await loadOrder({ id: order.id }))!;
    await sendConfirmation(fresh);
    return { changed: true, order: fresh };
  }

  async function markFailed(orderId: string, reason?: string): Promise<{ changed: boolean; order: OrderWithLines | null }> {
    const [won] = await db()
      .update(orders)
      .set({ status: 'payment_failed', paymentStatus: 'failed', updatedAt: new Date(), timeline: push(entry('payment_failed', reason ?? 'Payment failed')) })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending_payment')))
      .returning();
    if (!won) return { changed: false, order: await loadOrder({ id: orderId }) };
    await db().update(payments).set({ status: 'failed', failureReason: reason ?? null }).where(eq(payments.orderId, won.id));
    await releaseHolds(won.id);
    await sendFailed(won);
    return { changed: true, order: await loadOrder({ id: won.id }) };
  }

  /** Orders whose payment window lapsed → release stock, keep the order recoverable. */
  async function expireStale(now = new Date()): Promise<number> {
    const stale = await db().select({ id: orders.id }).from(orders).where(and(eq(orders.status, 'pending_payment'), lt(orders.reservationExpiresAt, now)));
    let n = 0;
    for (const s of stale) if ((await markFailed(s.id, 'Payment window expired')).changed) n++;
    return n;
  }

  async function retryPayment(orderNumber: string, accessToken: string, provider?: PaymentProvider): Promise<CheckoutResultDTO> {
    const order = await loadOrder({ number: orderNumber });
    if (!order || !tokenOk(order.number, accessToken)) throw notFound('Order');
    if (order.status === 'paid' || order.status === 'processing') throw conflict('This order is already paid', 'already_paid');
    if (!['payment_failed', 'pending_payment'].includes(order.status)) throw conflict('This order can no longer be paid', 'not_payable');
    const useProvider = (provider && provider !== 'cod' ? provider : order.provider === 'cod' ? 'mock' : order.provider) as PaymentProvider;
    const adapter = getAdapter(adapters, useProvider);
    if (!order.stockReserved) {
      await db().transaction(async (tx) => {
        await reserveStock(tx, reservedLines(order));
        await tx.update(orders).set({ stockReserved: true }).where(eq(orders.id, order.id));
      });
    }
    const created = await adapter.createPayment({ orderNumber: order.number, amount: order.total, currency: 'INR', email: order.email, name: order.shippingAddress.fullName, phone: order.shippingAddress.phone });
    await db()
      .update(orders)
      .set({ status: 'pending_payment', paymentStatus: 'pending', provider: useProvider, reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000), timeline: push(entry('pending_payment', 'Payment retried')) })
      .where(eq(orders.id, order.id));
    await db().insert(payments).values({ orderId: order.id, provider: useProvider, providerOrderId: created.providerOrderId, amount: order.total, status: 'pending', clientParams: created.client });
    return { order: { number: order.number, total: order.total, accessToken: tokenFor(order.number) }, payment: created.client };
  }

  /* ---------------- admin transitions ---------------- */
  const FLOW: Record<OrderStatus, OrderStatus[]> = {
    pending_payment: ['cancelled'],
    payment_failed: ['cancelled'],
    paid: ['processing', 'cancelled', 'refunded'],
    processing: ['shipped', 'cancelled', 'refunded'],
    shipped: ['delivered', 'refunded'],
    delivered: ['refunded'],
    cancelled: [],
    refunded: [],
  };

  async function setStatus(orderId: string, to: OrderStatus, by: string, text?: string): Promise<OrderWithLines> {
    const order = await loadOrder({ id: orderId });
    if (!order) throw notFound('Order');
    if (!FLOW[order.status as OrderStatus].includes(to)) throw conflict(`Cannot move an order from ${order.status} to ${to}`, 'invalid_transition');
    const [updated] = await db()
      .update(orders)
      .set({ status: to, updatedAt: new Date(), timeline: push(entry(to, text, by)) })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
      .returning();
    if (!updated) throw conflict('The order changed while you were editing. Reload and retry.', 'stale');
    if (to === 'cancelled') await releaseHolds(updated.id);
    return (await loadOrder({ id: updated.id }))!;
  }

  async function addShipment(orderId: string, data: { carrier: string; trackingNumber: string; trackingUrl?: string; status?: string }, by: string) {
    const order = await loadOrder({ id: orderId });
    if (!order) throw notFound('Order');
    if (!['paid', 'processing', 'shipped'].includes(order.status)) throw conflict('Only paid orders can be shipped', 'invalid_transition');
    const [shipment] = await db().insert(shipments).values({ orderId: order.id, carrier: data.carrier, trackingNumber: data.trackingNumber, trackingUrl: data.trackingUrl ?? null, status: data.status ?? 'label_created' }).returning();
    if (order.status === 'paid') await setStatus(orderId, 'processing', by);
    if (order.status !== 'shipped') await setStatus(orderId, 'shipped', by, `Shipped via ${data.carrier} (${data.trackingNumber})`);
    await sendShipped(order, data);
    return shipment!;
  }

  async function refund(orderId: string, amount: number, reason: string, by: string) {
    const order = await loadOrder({ id: orderId });
    if (!order) throw notFound('Order');
    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'partially_refunded') throw conflict('Only paid orders can be refunded', 'not_refundable');
    if (amount + order.refundedTotal > order.total) throw badRequest('Refund exceeds the amount paid', undefined, 'refund_too_large');
    const [pay] = await db().select().from(payments).where(and(eq(payments.orderId, order.id), inArray(payments.status, ['paid', 'partially_refunded']))).limit(1);
    if (!pay?.providerPaymentId) throw conflict('No captured payment found for this order', 'no_payment');
    const r = await getAdapter(adapters, pay.provider as PaymentProvider).refund({ providerPaymentId: pay.providerPaymentId, amount, reason });
    const full = amount + order.refundedTotal >= order.total;
    await db()
      .update(payments)
      .set({ status: full ? 'refunded' : 'partially_refunded', refunds: sql`${payments.refunds} || ${JSON.stringify([{ at: new Date().toISOString(), amount, reason, providerRefundId: r.providerRefundId, by }])}::jsonb` })
      .where(eq(payments.id, pay.id));
    await db()
      .update(orders)
      .set({
        refundedTotal: sql`${orders.refundedTotal} + ${amount}`,
        paymentStatus: full ? 'refunded' : 'partially_refunded',
        ...(full ? { status: 'refunded' } : {}),
        timeline: push(entry(full ? 'refunded' : order.status, `Refunded ${formatMoney(amount)} — ${reason}`, by)),
      })
      .where(eq(orders.id, order.id));
    if (full && order.stockReserved) await releaseHolds(order.id);
    return r;
  }

  async function verifyForCustomer(orderNumber: string, accessToken: string): Promise<OrderWithLines> {
    const order = await loadOrder({ number: orderNumber });
    if (!order) throw notFound('Order');
    if (!tokenOk(order.number, accessToken)) throw forbidden();
    return order;
  }

  return { checkout, markPaid, markFailed, expireStale, retryPayment, setStatus, addShipment, refund, verifyForCustomer, releaseHolds, tokenFor };
}
