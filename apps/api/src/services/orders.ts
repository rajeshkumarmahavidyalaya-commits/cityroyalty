import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { formatMoney, type CheckoutInput, type CheckoutResultDTO, type OrderDTO, type OrderStatus } from '@cityroyalty/shared';
import type { Config } from '../config';
import { safeEqual } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { escapeHtml, layout, type Mailer } from '../lib/mailer';
import { getSettings } from '../lib/settings';
import { logger } from '../logger';
import { Counter, Discount, Order, Payment, Shipment, type OrderHydrated } from '../models';
import { getAdapter, type PaymentAdapters } from '../payments';
import { reserveStock, restoreStock, type StockLine } from './inventory';
import { priceCart } from './pricing';

const RESERVATION_MINUTES = 30;

export type OrderService = ReturnType<typeof createOrderService>;

export function toOrderDTO(o: OrderHydrated | (Record<string, any> & { _id: unknown }), shipments: any[] = []): OrderDTO {
  const x = o as any;
  return {
    id: String(x._id),
    number: x.number,
    email: x.email,
    status: x.status,
    paymentStatus: x.paymentStatus,
    provider: x.provider,
    lines: x.lines.map((l: any) => ({ variantId: String(l.variantId), title: l.title, sku: l.sku, optionsLabel: l.optionsLabel ?? '', qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, image: l.image })),
    subtotal: x.subtotal,
    discountTotal: x.discountTotal ?? 0,
    discountCode: x.discountCode ?? undefined,
    shippingTotal: x.shippingTotal ?? 0,
    total: x.total,
    shippingAddress: {
      fullName: x.shippingAddress?.fullName ?? '', phone: x.shippingAddress?.phone ?? '', line1: x.shippingAddress?.line1 ?? '', line2: x.shippingAddress?.line2 ?? '',
      city: x.shippingAddress?.city ?? '', state: x.shippingAddress?.state ?? '', pin: x.shippingAddress?.pin ?? '', country: x.shippingAddress?.country ?? 'IN',
    },
    shipments: shipments.map((s) => ({ id: String(s._id), carrier: s.carrier, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl ?? undefined, status: s.status, createdAt: s.createdAt.toISOString() })),
    timeline: (x.timeline ?? []).map((t: any) => ({ at: new Date(t.at).toISOString(), status: t.status, note: t.note ?? undefined })),
    createdAt: x.createdAt.toISOString(),
    reservationExpiresAt: x.reservationExpiresAt ? new Date(x.reservationExpiresAt).toISOString() : undefined,
  };
}

interface Deps {
  config: Config;
  adapters: PaymentAdapters;
  mailer: Mailer;
}

export function createOrderService({ config, adapters, mailer }: Deps) {
  /** Guest access token: derivable (so an idempotent replay can return it) but unforgeable without the server secret. */
  const tokenFor = (orderNumber: string) => createHmac('sha256', config.jwtSecret).update(`order-access:${orderNumber}`).digest('base64url');
  const tokenOk = (orderNumber: string, token: string) => safeEqual(tokenFor(orderNumber), token);
  const stockLines = (o: { lines: { productId: unknown; variantId: unknown; qty: number; reserved?: boolean | null }[] }): StockLine[] =>
    o.lines.filter((l) => l.reserved).map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), qty: l.qty, madeToOrder: false }));

  async function nextNumber(): Promise<string> {
    const c = await Counter.findOneAndUpdate({ _id: 'order' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    return `CR-${100000 + c.seq}`;
  }

  const note = (status: string, text?: string, by = 'system') => ({ at: new Date(), status, note: text, by });

  /* ---------------- emails ---------------- */
  async function sendConfirmation(o: OrderHydrated) {
    const rows = o.lines
      .map((l) => `<tr><td style="padding:8px 0">${escapeHtml(l.title ?? '')}<br><span style="color:#6b5a4c;font-size:12px">${escapeHtml(l.optionsLabel ?? '')} × ${l.qty}</span></td><td align="right">${formatMoney(l.lineTotal)}</td></tr>`)
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
  async function sendFailed(o: OrderHydrated, token?: string) {
    await mailer.send({
      to: o.email,
      subject: `Your payment didn’t go through — ${o.number}`,
      text: `We couldn’t complete the payment for ${o.number}. You can try again from your bag.`,
      html: layout('Your payment didn’t go through', `<p>We couldn’t complete the payment for order <b>${o.number}</b>. Nothing has been charged. You can pick up where you left off.</p>`, {
        label: 'Complete your order',
        href: `${config.PUBLIC_WEB_URL}/checkout/failed?order=${o.number}${token ? `&token=${encodeURIComponent(token)}` : ''}`,
      }),
    });
  }
  async function sendShipped(o: OrderHydrated, s: { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null }) {
    await mailer.send({
      to: o.email,
      subject: `Your order ${o.number} is on its way`,
      text: `Shipped via ${s.carrier}, tracking ${s.trackingNumber}.`,
      html: layout('Your order is on its way', `<p>Order <b>${o.number}</b> has shipped with <b>${escapeHtml(s.carrier ?? '')}</b>.<br>Tracking number: <b>${escapeHtml(s.trackingNumber ?? '')}</b></p>`, s.trackingUrl ? { label: 'Track shipment', href: s.trackingUrl } : undefined),
    });
  }

  /* ---------------- reservation release ---------------- */
  async function releaseHolds(orderId: unknown): Promise<void> {
    const stock = await Order.findOneAndUpdate({ _id: orderId, stockReserved: true }, { $set: { stockReserved: false } }, { returnDocument: 'before' });
    if (stock) await restoreStock(stockLines(stock));
    const disc = await Order.findOneAndUpdate({ _id: orderId, discountReserved: true }, { $set: { discountReserved: false } }, { returnDocument: 'before' });
    if (disc?.discountCode) await Discount.updateOne({ code: disc.discountCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }

  /* ---------------- checkout ---------------- */
  async function checkout(input: CheckoutInput, userId?: string): Promise<CheckoutResultDTO> {
    const settings = await getSettings();

    // idempotent replay (double click / network retry) → same order, same payment params
    const existing = await Order.findOne({ idempotencyKey: input.idempotencyKey });
    if (existing) {
      const pay = await Payment.findOne({ orderId: existing._id }).sort({ createdAt: -1 });
      if (pay?.clientParams) {
        return { order: { number: existing.number, total: existing.total, accessToken: tokenFor(existing.number) }, payment: pay.clientParams as CheckoutResultDTO['payment'] };
      }
      throw conflict('This order was already placed', 'duplicate_checkout', { orderNumber: existing.number });
    }

    const provider = input.provider;
    if (provider === 'cod' && !settings.shipping.codEnabled) throw badRequest('Cash on delivery is not available', undefined, 'provider_unavailable');
    const adapter = provider === 'cod' ? null : getAdapter(adapters, provider);

    const pr = await priceCart({ lines: input.lines, discountCode: input.discountCode }, settings, { cod: provider === 'cod' });
    if (!pr.priced.ok || pr.priced.total == null) throw conflict('Your bag changed. Please review it before paying.', 'cart_invalid', pr.priced);
    if (input.discountCode && !pr.discountDoc) throw badRequest(pr.priced.discountError ?? 'Discount code is not valid', undefined, 'invalid_discount');
    const total = pr.priced.total;

    // 1. take the discount use
    let discountReserved = false;
    if (pr.discountDoc) {
      const d = pr.discountDoc;
      const r = await Discount.updateOne(
        { _id: d._id, active: true, ...(d.maxUses != null ? { usedCount: { $lt: d.maxUses } } : {}) },
        { $inc: { usedCount: 1 } },
      );
      if (r.modifiedCount !== 1) throw badRequest('That code has been fully redeemed', undefined, 'invalid_discount');
      discountReserved = true;
    }

    // 2. take the stock (all-or-nothing)
    const toReserve: StockLine[] = pr.resolved.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, madeToOrder: l.madeToOrder }));
    try {
      await reserveStock(toReserve);
    } catch (err) {
      if (discountReserved) await Discount.updateOne({ _id: pr.discountDoc!._id }, { $inc: { usedCount: -1 } });
      throw err;
    }

    // 3. create the order
    let order: OrderHydrated;
    try {
      order = await Order.create({
        number: await nextNumber(),
        userId: userId ? new Types.ObjectId(userId) : undefined,
        email: input.email,
        status: provider === 'cod' ? 'processing' : 'pending_payment',
        paymentStatus: provider === 'cod' ? 'cod_pending' : 'pending',
        provider,
        lines: pr.resolved.map((l) => ({
          productId: l.productId, variantId: l.variantId, title: l.title, slug: l.slug, sku: l.sku, optionsLabel: l.optionsLabel, image: l.image,
          qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.unitPrice * l.qty, reserved: !l.madeToOrder,
        })),
        subtotal: pr.priced.subtotal,
        discountTotal: pr.priced.discount?.amount ?? 0,
        discountCode: pr.priced.discount?.code,
        shippingTotal: pr.priced.shipping ?? 0,
        codFee: pr.codFee,
        total,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingSameAsShipping ? input.shippingAddress : input.billingAddress,
        notes: input.notes,
        stockReserved: true,
        discountReserved,
        reservationExpiresAt: provider === 'cod' ? undefined : new Date(Date.now() + RESERVATION_MINUTES * 60_000),
        idempotencyKey: input.idempotencyKey,
        timeline: [note(provider === 'cod' ? 'processing' : 'pending_payment', 'Order placed')],
      });
    } catch (err) {
      await restoreStock(toReserve);
      if (discountReserved) await Discount.updateOne({ _id: pr.discountDoc!._id }, { $inc: { usedCount: -1 } });
      throw err;
    }

    // 4. payment session
    try {
      let client: CheckoutResultDTO['payment'];
      if (!adapter) {
        client = { provider: 'cod' };
        await Payment.create({ orderId: order._id, provider, amount: total, status: 'cod_pending', clientParams: client });
        await sendConfirmation(order);
      } else {
        const created = await adapter.createPayment({
          orderNumber: order.number, amount: total, currency: 'INR', email: order.email,
          name: input.shippingAddress.fullName, phone: input.shippingAddress.phone,
        });
        client = created.client;
        await Payment.create({ orderId: order._id, provider, providerOrderId: created.providerOrderId, amount: total, status: 'pending', clientParams: client });
      }
      return { order: { number: order.number, total, accessToken: tokenFor(order.number) }, payment: client };
    } catch (err) {
      await releaseHolds(order._id);
      await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled', paymentStatus: 'failed' }, $push: { timeline: note('cancelled', 'Could not start payment') } });
      throw err;
    }
  }

  /* ---------------- payment outcomes (idempotent) ---------------- */
  async function markPaid(
    orderId: unknown,
    info: { providerPaymentId?: string; amount?: number; via: string },
  ): Promise<{ changed: boolean; order: OrderHydrated | null }> {
    const order = await Order.findById(orderId);
    if (!order) return { changed: false, order: null };
    if (info.amount != null && info.amount !== order.total) {
      logger.error({ order: order.number, expected: order.total, got: info.amount }, 'payment amount mismatch');
      await Order.updateOne({ _id: order._id }, { $addToSet: { flags: 'amount_mismatch' }, $push: { timeline: note(order.status, `Payment amount mismatch (${info.amount} vs ${order.total})`) } });
      return { changed: false, order };
    }
    // only one caller can win this transition → no duplicate "paid", no double emails
    const won = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: ['pending_payment', 'payment_failed'] } },
      {
        $set: { status: 'paid', paymentStatus: 'paid', paidAt: new Date() },
        $unset: { reservationExpiresAt: '' },
        $push: { timeline: note('paid', `Payment received (${info.via})`) },
      },
      { returnDocument: 'after' },
    );
    if (!won) return { changed: false, order };
    await Payment.updateOne({ orderId: order._id }, { $set: { status: 'paid', providerPaymentId: info.providerPaymentId } });

    // The reservation may have expired before a late payment landed → take the stock again.
    if (!won.stockReserved) {
      try {
        await reserveStock(won.lines.filter((l) => l.reserved).map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), qty: l.qty, madeToOrder: false })));
        await Order.updateOne({ _id: won._id }, { $set: { stockReserved: true } });
      } catch {
        await Order.updateOne({ _id: won._id }, { $addToSet: { flags: 'stock_conflict' }, $push: { timeline: note('paid', 'Paid after the stock hold expired and stock ran out — needs manual action (refund or backorder)') } });
      }
    }
    const fresh = (await Order.findById(won._id))!;
    await sendConfirmation(fresh);
    return { changed: true, order: fresh };
  }

  async function markFailed(orderId: unknown, reason?: string): Promise<{ changed: boolean; order: OrderHydrated | null }> {
    const won = await Order.findOneAndUpdate(
      { _id: orderId, status: 'pending_payment' },
      { $set: { status: 'payment_failed', paymentStatus: 'failed' }, $push: { timeline: note('payment_failed', reason ?? 'Payment failed') } },
      { returnDocument: 'after' },
    );
    if (!won) return { changed: false, order: await Order.findById(orderId) };
    await Payment.updateOne({ orderId: won._id }, { $set: { status: 'failed', failureReason: reason } });
    await releaseHolds(won._id);
    await sendFailed(won, tokenFor(won.number));
    return { changed: true, order: won };
  }

  /** Orders whose payment window lapsed → release stock, keep the order recoverable. */
  async function expireStale(now = new Date()): Promise<number> {
    const stale = await Order.find({ status: 'pending_payment', reservationExpiresAt: { $lt: now } }).select('_id');
    let n = 0;
    for (const s of stale) {
      const r = await markFailed(s._id, 'Payment window expired');
      if (r.changed) n++;
    }
    return n;
  }

  /** Customer retries a failed/expired payment: take stock again and open a new provider session. */
  async function retryPayment(orderNumber: string, accessToken: string, provider?: CheckoutInput['provider']): Promise<CheckoutResultDTO> {
    const order = await Order.findOne({ number: orderNumber });
    if (!order || !tokenOk(order.number, accessToken)) throw notFound('Order');
    if (order.status === 'paid' || order.status === 'processing') throw conflict('This order is already paid', 'already_paid');
    if (!['payment_failed', 'pending_payment'].includes(order.status)) throw conflict('This order can no longer be paid', 'not_payable');
    const useProvider = provider && provider !== 'cod' ? provider : (order.provider === 'cod' ? 'mock' : order.provider);
    const adapter = getAdapter(adapters, useProvider);

    if (!order.stockReserved) {
      await reserveStock(order.lines.filter((l) => l.reserved).map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), qty: l.qty, madeToOrder: false })));
    }
    const created = await adapter.createPayment({
      orderNumber: order.number, amount: order.total, currency: 'INR', email: order.email,
      name: order.shippingAddress?.fullName ?? '', phone: order.shippingAddress?.phone ?? '',
    });
    await Order.updateOne(
      { _id: order._id },
      { $set: { status: 'pending_payment', paymentStatus: 'pending', stockReserved: true, provider: useProvider, reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000) }, $push: { timeline: note('pending_payment', 'Payment retried') } },
    );
    await Payment.create({ orderId: order._id, provider: useProvider, providerOrderId: created.providerOrderId, amount: order.total, status: 'pending', clientParams: created.client });
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

  async function setStatus(orderId: string, to: OrderStatus, by: string, text?: string): Promise<OrderHydrated> {
    const order = await Order.findById(orderId);
    if (!order) throw notFound('Order');
    if (!FLOW[order.status as OrderStatus].includes(to)) throw conflict(`Cannot move an order from ${order.status} to ${to}`, 'invalid_transition');
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { status: to }, $push: { timeline: note(to, text, by) } },
      { returnDocument: 'after' },
    );
    if (!updated) throw conflict('The order changed while you were editing. Reload and retry.', 'stale');
    if (to === 'cancelled') await releaseHolds(updated._id);
    return updated;
  }

  async function addShipment(orderId: string, data: { carrier: string; trackingNumber: string; trackingUrl?: string; status?: string }, by: string) {
    const order = await Order.findById(orderId);
    if (!order) throw notFound('Order');
    if (!['paid', 'processing', 'shipped'].includes(order.status) && !(order.provider === 'cod' && order.status === 'processing')) throw conflict('Only paid orders can be shipped', 'invalid_transition');
    const shipment = await Shipment.create({ orderId: order._id, ...data, status: (data.status ?? 'label_created') as 'label_created' });
    const next = order.status === 'shipped' ? order : await setStatus(orderId, order.status === 'paid' ? 'processing' : order.status, by).catch(() => order);
    if (next.status !== 'shipped') await setStatus(orderId, 'shipped', by, `Shipped via ${data.carrier} (${data.trackingNumber})`);
    const fresh = (await Order.findById(orderId))!;
    await sendShipped(fresh, data);
    return shipment;
  }

  async function refund(orderId: string, amount: number, reason: string, by: string) {
    const order = await Order.findById(orderId);
    if (!order) throw notFound('Order');
    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'partially_refunded') throw conflict('Only paid orders can be refunded', 'not_refundable');
    if (amount + order.refundedTotal > order.total) throw badRequest('Refund exceeds the amount paid', undefined, 'refund_too_large');
    const pay = await Payment.findOne({ orderId: order._id, status: { $in: ['paid', 'partially_refunded'] } });
    if (!pay?.providerPaymentId) throw conflict('No captured payment found for this order', 'no_payment');
    const adapter = getAdapter(adapters, pay.provider as any);
    const r = await adapter.refund({ providerPaymentId: pay.providerPaymentId, amount, reason });
    const full = amount + order.refundedTotal >= order.total;
    await Payment.updateOne({ _id: pay._id }, { $set: { status: full ? 'refunded' : 'partially_refunded' }, $push: { refunds: { at: new Date(), amount, reason, providerRefundId: r.providerRefundId, by } } });
    await Order.updateOne(
      { _id: order._id },
      { $inc: { refundedTotal: amount }, $set: { paymentStatus: full ? 'refunded' : 'partially_refunded', ...(full ? { status: 'refunded' } : {}) }, $push: { timeline: note(full ? 'refunded' : order.status, `Refunded ${formatMoney(amount)} — ${reason}`, by) } },
    );
    if (full && order.stockReserved) await releaseHolds(order._id);
    return r;
  }

  async function verifyForCustomer(orderNumber: string, accessToken: string): Promise<OrderHydrated> {
    const order = await Order.findOne({ number: orderNumber });
    if (!order) throw notFound('Order');
    if (!tokenOk(order.number, accessToken)) throw forbidden();
    return order;
  }

  return { checkout, markPaid, markFailed, expireStale, retryPayment, setStatus, addShipment, refund, verifyForCustomer, releaseHolds, sendFailed, tokenFor };
}
