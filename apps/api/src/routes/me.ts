import { Router } from 'express';
import { z } from 'zod';
import { addressSchema, cartLineSchema, objectId, profileSchema, returnRequestSchema } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { clearSession, requireAuth } from '../lib/auth';
import { conflict, notFound } from '../lib/errors';
import { idParam, parse, wrap } from '../lib/http';
import { Cart, Order, Product, ReturnRequest, Shipment, User, Wishlist } from '../models';
import { toOrderDTO } from '../services/orders';
import { toCard } from '../services/catalog';
import { toUserDTO } from './auth';
import { audit } from '../lib/audit';

const addressDTO = (a: any) => ({
  id: String(a._id), fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, pin: a.pin, country: a.country ?? 'IN', isDefault: Boolean(a.isDefault),
});

export function meRoutes({ orders }: Deps) {
  const r = Router();
  r.use(requireAuth);

  r.patch('/profile', wrap(async (req, res) => {
    const data = parse(profileSchema, req.body);
    const u = await User.findByIdAndUpdate(req.user!.id, { $set: data }, { returnDocument: 'after' });
    res.json({ user: toUserDTO(u) });
  }));

  /* addresses */
  r.get('/addresses', wrap(async (req, res) => {
    const u = await User.findById(req.user!.id).lean();
    res.json({ items: (u?.addresses ?? []).map(addressDTO) });
  }));
  r.post('/addresses', wrap(async (req, res) => {
    const a = parse(addressSchema.extend({ isDefault: z.boolean().optional() }), req.body);
    const u = (await User.findById(req.user!.id))!;
    if (a.isDefault || !u.addresses.length) u.addresses.forEach((x) => (x.isDefault = false));
    u.addresses.push({ ...a, isDefault: a.isDefault || !u.addresses.length } as any);
    if (u.addresses.length > 10) throw conflict('You can save up to 10 addresses', 'limit');
    await u.save();
    res.status(201).json({ items: u.addresses.map(addressDTO) });
  }));
  r.put('/addresses/:id', wrap(async (req, res) => {
    const a = parse(addressSchema.extend({ isDefault: z.boolean().optional() }), req.body);
    const u = (await User.findById(req.user!.id))!;
    const target = u.addresses.id(idParam(req));
    if (!target) throw notFound('Address');
    if (a.isDefault) u.addresses.forEach((x) => (x.isDefault = false));
    target.set(a);
    await u.save();
    res.json({ items: u.addresses.map(addressDTO) });
  }));
  r.delete('/addresses/:id', wrap(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $pull: { addresses: { _id: idParam(req) } } });
    const u = await User.findById(req.user!.id).lean();
    res.json({ items: (u?.addresses ?? []).map(addressDTO) });
  }));

  /* orders */
  r.get('/orders', wrap(async (req, res) => {
    const list = await Order.find({ $or: [{ userId: req.user!.id }, { email: req.user!.email }] }).sort({ createdAt: -1 }).limit(100);
    res.json({ items: list.map((o) => toOrderDTO(o)) });
  }));
  r.get('/orders/:number', wrap(async (req, res) => {
    const o = await Order.findOne({ number: String(req.params.number), $or: [{ userId: req.user!.id }, { email: req.user!.email }] });
    if (!o) throw notFound('Order');
    const shipments = await Shipment.find({ orderId: o._id }).lean();
    res.json(toOrderDTO(o, shipments));
  }));
  r.post('/orders/:number/return', wrap(async (req, res) => {
    const body = parse(returnRequestSchema.omit({ orderNumber: true, accessToken: true }), req.body);
    const o = await Order.findOne({ number: String(req.params.number), $or: [{ userId: req.user!.id }, { email: req.user!.email }] });
    if (!o) throw notFound('Order');
    if (!['delivered', 'shipped'].includes(o.status)) throw conflict('Returns can be requested after the order has shipped', 'not_returnable');
    for (const l of body.lines) {
      const ol = o.lines.find((x) => String(x.variantId) === l.variantId);
      if (!ol || l.qty > ol.qty) throw conflict('Invalid return quantity', 'invalid_lines');
    }
    const ret = await ReturnRequest.create({
      orderId: o._id, orderNumber: o.number, email: o.email, reason: body.reason,
      lines: body.lines.map((l) => ({ ...l, title: o.lines.find((x) => String(x.variantId) === l.variantId)?.title })),
      notes: [{ status: 'requested', note: body.reason, by: req.user!.email }],
    });
    res.status(201).json({ id: String(ret._id), status: ret.status });
  }));
  r.get('/returns', wrap(async (req, res) => {
    const list = await ReturnRequest.find({ email: req.user!.email }).sort({ createdAt: -1 }).lean();
    res.json({ items: list.map((x) => ({ id: String(x._id), orderNumber: x.orderNumber, status: x.status, reason: x.reason, createdAt: (x as any).createdAt.toISOString() })) });
  }));

  /* wishlist */
  r.get('/wishlist', wrap(async (req, res) => {
    const w = await Wishlist.findOne({ userId: req.user!.id }).lean();
    const ids = (w?.productIds ?? []).map(String);
    const products = await Product.find({ _id: { $in: ids }, status: 'published' }).lean();
    res.json({ ids, items: products.map((p) => toCard(p as any)) });
  }));
  r.put('/wishlist', wrap(async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(objectId).max(200) }), req.body);
    await Wishlist.updateOne({ userId: req.user!.id }, { $set: { productIds: ids } }, { upsert: true });
    res.json({ ids });
  }));

  /* persistent cart */
  r.get('/cart', wrap(async (req, res) => {
    const c = await Cart.findOne({ userId: req.user!.id }).lean();
    res.json({ lines: (c?.lines ?? []).map((l) => ({ productId: String(l.productId), variantId: String(l.variantId), qty: l.qty })) });
  }));
  r.put('/cart', wrap(async (req, res) => {
    const { lines } = parse(z.object({ lines: z.array(cartLineSchema).max(30) }), req.body);
    await Cart.updateOne({ userId: req.user!.id }, { $set: { lines } }, { upsert: true });
    res.json({ lines });
  }));

  /* privacy: account deletion request (processed by staff; orders kept as legally required) */
  r.post('/delete-request', wrap(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $set: { deletionRequestedAt: new Date() } });
    await audit(req, 'account.delete_requested', 'user', req.user!.id, 'Customer requested account deletion');
    res.json({ ok: true });
  }));
  r.post('/logout-all', wrap(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
    clearSession(res);
    res.json({ ok: true });
  }));

  void orders;
  return r;
}
