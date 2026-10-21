import { Router } from 'express';
import { z } from 'zod';
import {
  ORDER_STATUSES,
  discountInputSchema,
  inventoryAdjustSchema,
  orderStatusUpdateSchema,
  refundSchema,
  returnUpdateSchema,
  shipmentInputSchema,
} from '@cityroyalty/shared';
import type { Deps } from '../../app';
import { audit } from '../../lib/audit';
import { requireRole } from '../../lib/auth';
import { conflict, notFound } from '../../lib/errors';
import { escapeRegex, idParam, parse, wrap } from '../../lib/http';
import { Discount, Order, Payment, Product, ReturnRequest, Shipment, Subscriber, User } from '../../models';
import { toOrderDTO } from '../../services/orders';
import { refreshAvailability } from '../../services/inventory';

export function adminCommerceRoutes({ orders, revalidate }: Deps) {
  const r = Router();
  const mgr = requireRole('manager', 'admin');

  /* ---------- orders ---------- */
  r.get('/orders', mgr, wrap(async (req, res) => {
    const { status, q, page = '1' } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) filter.status = status;
    if (q) filter.$or = [{ number: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }, { 'shippingAddress.fullName': new RegExp(escapeRegex(q), 'i') }];
    const limit = 30;
    const pg = Math.max(1, Number(page) || 1);
    const [items, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * limit).limit(limit), Order.countDocuments(filter)]);
    res.json({ items: items.map((o) => ({ ...toOrderDTO(o), flags: o.flags })), page: pg, pages: Math.max(1, Math.ceil(total / limit)), total });
  }));

  r.get('/orders/:id', mgr, wrap(async (req, res) => {
    const o = await Order.findById(idParam(req));
    if (!o) throw notFound('Order');
    const [shipments, payments] = await Promise.all([Shipment.find({ orderId: o._id }).lean(), Payment.find({ orderId: o._id }).sort({ createdAt: -1 }).lean()]);
    res.json({
      ...toOrderDTO(o, shipments), flags: o.flags, refundedTotal: o.refundedTotal, notes: o.notes,
      payments: payments.map((p: any) => ({ id: String(p._id), provider: p.provider, status: p.status, amount: p.amount, providerPaymentId: p.providerPaymentId, refunds: p.refunds })),
    });
  }));

  r.post('/orders/:id/status', mgr, wrap(async (req, res) => {
    const { status, note } = parse(orderStatusUpdateSchema, req.body);
    const o = await orders.setStatus(idParam(req), status, req.user!.email, note);
    await audit(req, 'order.status', 'order', String(o._id), `${o.number} → ${status}`);
    res.json(toOrderDTO(o));
  }));

  r.post('/orders/:id/shipments', mgr, wrap(async (req, res) => {
    const data = parse(shipmentInputSchema, req.body);
    const s = await orders.addShipment(idParam(req), data, req.user!.email);
    await audit(req, 'order.ship', 'order', idParam(req), `Shipment ${data.carrier} ${data.trackingNumber}`);
    res.status(201).json({ id: String(s._id) });
  }));

  r.patch('/shipments/:id', mgr, wrap(async (req, res) => {
    const { status } = parse(z.object({ status: shipmentInputSchema.shape.status }), req.body);
    const s = await Shipment.findByIdAndUpdate(idParam(req), { $set: { status } }, { returnDocument: 'after' });
    if (!s) throw notFound('Shipment');
    if (status === 'delivered') await orders.setStatus(String(s.orderId), 'delivered', req.user!.email, 'Delivered').catch(() => undefined);
    res.json({ ok: true });
  }));

  r.post('/orders/:id/refund', mgr, wrap(async (req, res) => {
    const { amount, reason } = parse(refundSchema, req.body);
    await orders.refund(idParam(req), amount, reason, req.user!.email);
    await audit(req, 'order.refund', 'order', idParam(req), `Refund ${amount} — ${reason}`);
    res.json({ ok: true });
  }));

  /* ---------- returns ---------- */
  r.get('/returns', mgr, wrap(async (req, res) => {
    const filter: Record<string, unknown> = req.query.status ? { status: String(req.query.status) } : {};
    const items = await ReturnRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ items: items.map((x) => ({ id: String(x._id), orderNumber: x.orderNumber, email: x.email, status: x.status, reason: x.reason, lines: x.lines, notes: x.notes, createdAt: (x as any).createdAt.toISOString() })) });
  }));
  r.patch('/returns/:id', mgr, wrap(async (req, res) => {
    const { status, note } = parse(returnUpdateSchema, req.body);
    const ret = await ReturnRequest.findByIdAndUpdate(idParam(req), { $set: { status }, $push: { notes: { at: new Date(), status, note, by: req.user!.email } } }, { returnDocument: 'after' });
    if (!ret) throw notFound('Return');
    await audit(req, 'return.update', 'return', String(ret._id), `${ret.orderNumber} → ${status}`);
    res.json({ ok: true });
  }));

  /* ---------- inventory ---------- */
  r.get('/inventory', mgr, wrap(async (req, res) => {
    const filter = req.query.q ? { $or: [{ title: new RegExp(escapeRegex(String(req.query.q)), 'i') }, { 'variants.sku': new RegExp(escapeRegex(String(req.query.q)), 'i') }] } : {};
    const products = await Product.find(filter).select('title slug status variants').sort({ title: 1 }).limit(300).lean();
    const rows = products.flatMap((p) =>
      p.variants.map((v) => ({
        productId: String(p._id), variantId: String(v._id), title: p.title, status: p.status, sku: v.sku, active: v.active,
        options: v.options instanceof Map ? Object.fromEntries(v.options) : v.options, stock: v.stock ?? null, madeToOrder: v.madeToOrder,
      })),
    );
    res.json({ items: rows });
  }));
  r.post('/inventory/adjust', mgr, wrap(async (req, res) => {
    const { variantId, stock, reason } = parse(inventoryAdjustSchema, req.body);
    const p = await Product.findOne({ 'variants._id': variantId });
    if (!p) throw notFound('Variant');
    const before = p.variants.id(variantId)?.stock;
    await Product.updateOne({ _id: p._id, 'variants._id': variantId }, { $set: { 'variants.$.stock': stock } });
    const fresh = (await Product.findById(p._id))!;
    await fresh.save(); // recompute blockers / availability
    await refreshAvailability([String(p._id)]);
    await audit(req, 'inventory.adjust', 'variant', variantId, `${p.title}: ${before ?? 'unknown'} → ${stock ?? 'unknown'} (${reason})`);
    void revalidate('products', `product:${p.slug}`);
    res.json({ ok: true });
  }));

  /* ---------- discounts ---------- */
  r.get('/discounts', mgr, wrap(async (_req, res) => {
    res.json({ items: (await Discount.find().sort({ createdAt: -1 }).lean()).map((d) => ({ ...d, id: String(d._id) })) });
  }));
  r.post('/discounts', mgr, wrap(async (req, res) => {
    const data = parse(discountInputSchema, req.body);
    if (await Discount.exists({ code: data.code })) throw conflict('That code already exists', 'duplicate');
    const d = await Discount.create(data);
    await audit(req, 'discount.create', 'discount', String(d._id), `Created ${d.code}`);
    res.status(201).json({ id: String(d._id) });
  }));
  r.put('/discounts/:id', mgr, wrap(async (req, res) => {
    const data = parse(discountInputSchema, req.body);
    const d = await Discount.findByIdAndUpdate(idParam(req), { $set: data }, { returnDocument: 'after' });
    if (!d) throw notFound('Discount');
    await audit(req, 'discount.update', 'discount', String(d._id), `Updated ${d.code}`);
    res.json({ id: String(d._id) });
  }));
  r.delete('/discounts/:id', mgr, wrap(async (req, res) => {
    const d = await Discount.findByIdAndDelete(idParam(req));
    if (d) await audit(req, 'discount.delete', 'discount', String(d._id), `Deleted ${d.code}`);
    res.json({ ok: true });
  }));

  /* ---------- customers & subscribers ---------- */
  r.get('/customers', mgr, wrap(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : '';
    const filter: Record<string, unknown> = { role: 'customer' };
    if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }];
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const spend = await Order.aggregate([
      { $match: { email: { $in: users.map((u) => u.email) }, status: { $in: ['paid', 'processing', 'shipped', 'delivered'] } } },
      { $group: { _id: '$email', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
    ]);
    const m = new Map(spend.map((s) => [s._id as string, s]));
    res.json({
      items: users.map((u) => ({
        id: String(u._id), name: u.name, email: u.email, phone: u.phone ?? null, createdAt: (u as any).createdAt.toISOString(),
        orders: m.get(u.email)?.orders ?? 0, spent: m.get(u.email)?.spent ?? 0, deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      })),
    });
  }));

  /** Privacy: erase a customer's personal data on request. Order records are retained (tax/legal) with the contact details kept on the order only. */
  r.post('/customers/:id/anonymize', requireRole('admin'), wrap(async (req, res) => {
    const u = await User.findById(idParam(req));
    if (!u || u.role !== 'customer') throw notFound('Customer');
    const id = String(u._id);
    await User.updateOne({ _id: u._id }, { $set: { name: 'Deleted customer', email: `deleted+${id}@invalid.local`, addresses: [], phone: null, passwordHash: 'x', deletionRequestedAt: new Date() }, $inc: { tokenVersion: 1 } });
    await Subscriber.deleteOne({ email: u.email });
    await audit(req, 'customer.anonymize', 'user', id, 'Customer data erased on request');
    res.json({ ok: true });
  }));

  r.get('/subscribers', mgr, wrap(async (req, res) => {
    const items = await Subscriber.find().sort({ createdAt: -1 }).limit(2000).lean();
    if (req.query.format === 'csv') {
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="subscribers.csv"');
      return void res.send('email,source,subscribed_at\n' + items.map((s) => `${s.email},${s.source ?? ''},${(s as any).createdAt.toISOString()}`).join('\n'));
    }
    res.json({ items: items.map((s) => ({ id: String(s._id), email: s.email, source: s.source ?? null, createdAt: (s as any).createdAt.toISOString() })), total: items.length });
  }));
  r.delete('/subscribers/:id', mgr, wrap(async (req, res) => {
    await Subscriber.findByIdAndDelete(idParam(req));
    res.json({ ok: true });
  }));

  return r;
}
