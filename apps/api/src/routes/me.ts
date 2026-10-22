import { Router } from 'express';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { addressSchema, cartLineSchema, entityId, profileSchema, returnRequestSchema } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { db } from '../db';
import { addresses, carts, orders, products, returns, users, wishlists } from '../db/schema';
import { audit } from '../lib/audit';
import { clearSession, requireAuth } from '../lib/auth';
import { conflict, notFound } from '../lib/errors';
import { idParam, parse, wrap } from '../lib/http';
import { toCard } from '../services/catalog';
import { shipmentsFor, toOrderDTO, withLines } from '../services/orders';
import { hydrate } from '../services/products';
import { toUserDTO } from './auth';

const addressDTO = (a: typeof addresses.$inferSelect) => ({
  id: a.id, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pin: a.pin, country: a.country, isDefault: a.isDefault,
});
const addressInput = addressSchema.extend({ isDefault: z.boolean().optional() });

export function meRoutes(_deps: Deps) {
  const r = Router();
  r.use(requireAuth);
  const mine = (userId: string, email: string) => or(eq(orders.userId, userId), eq(orders.email, email));
  const listAddresses = async (userId: string) => (await db().select().from(addresses).where(eq(addresses.userId, userId)).orderBy(asc(addresses.createdAt))).map(addressDTO);

  r.patch('/profile', wrap(async (req, res) => {
    const data = parse(profileSchema, req.body);
    const [u] = await db().update(users).set({ name: data.name, ...(data.phone ? { phone: data.phone } : {}), updatedAt: new Date() }).where(eq(users.id, req.user!.id)).returning();
    res.json({ user: toUserDTO(u!) });
  }));

  /* addresses */
  r.get('/addresses', wrap(async (req, res) => res.json({ items: await listAddresses(req.user!.id) })));
  r.post('/addresses', wrap(async (req, res) => {
    const a = parse(addressInput, req.body);
    const uid = req.user!.id;
    await db().transaction(async (tx) => {
      const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, uid));
      if (existing.length >= 10) throw conflict('You can save up to 10 addresses', 'limit');
      const isDefault = Boolean(a.isDefault) || existing.length === 0;
      if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, uid));
      await tx.insert(addresses).values({ ...a, line2: a.line2 ?? '', isDefault, userId: uid });
    });
    res.status(201).json({ items: await listAddresses(uid) });
  }));
  r.put('/addresses/:id', wrap(async (req, res) => {
    const a = parse(addressInput, req.body);
    const uid = req.user!.id;
    const id = idParam(req);
    await db().transaction(async (tx) => {
      if (a.isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, uid));
      const r2 = await tx.update(addresses).set({ ...a, line2: a.line2 ?? '', isDefault: Boolean(a.isDefault) }).where(and(eq(addresses.id, id), eq(addresses.userId, uid))).returning({ id: addresses.id });
      if (!r2.length) throw notFound('Address');
    });
    res.json({ items: await listAddresses(uid) });
  }));
  r.delete('/addresses/:id', wrap(async (req, res) => {
    await db().delete(addresses).where(and(eq(addresses.id, idParam(req)), eq(addresses.userId, req.user!.id)));
    res.json({ items: await listAddresses(req.user!.id) });
  }));

  /* orders */
  r.get('/orders', wrap(async (req, res) => {
    const rows = await db().select().from(orders).where(mine(req.user!.id, req.user!.email)).orderBy(desc(orders.createdAt)).limit(100);
    res.json({ items: (await withLines(rows)).map((o) => toOrderDTO(o)) });
  }));
  r.get('/orders/:number', wrap(async (req, res) => {
    const [row] = await db().select().from(orders).where(and(eq(orders.number, String(req.params.number)), mine(req.user!.id, req.user!.email)));
    if (!row) throw notFound('Order');
    const [o] = await withLines([row]);
    res.json(toOrderDTO(o!, await shipmentsFor(row.id)));
  }));
  r.post('/orders/:number/return', wrap(async (req, res) => {
    const body = parse(returnRequestSchema.omit({ orderNumber: true, accessToken: true }), req.body);
    const [row] = await db().select().from(orders).where(and(eq(orders.number, String(req.params.number)), mine(req.user!.id, req.user!.email)));
    if (!row) throw notFound('Order');
    const [o] = await withLines([row]);
    if (!['delivered', 'shipped'].includes(o!.status)) throw conflict('Returns can be requested after the order has shipped', 'not_returnable');
    for (const l of body.lines) {
      const ol = o!.lines.find((x) => x.variantId === l.variantId);
      if (!ol || l.qty > ol.qty) throw conflict('Invalid return quantity', 'invalid_lines');
    }
    const [ret] = await db()
      .insert(returns)
      .values({
        orderId: o!.id, orderNumber: o!.number, email: o!.email, reason: body.reason,
        lines: body.lines.map((l) => ({ ...l, title: o!.lines.find((x) => x.variantId === l.variantId)?.title })),
        notes: [{ at: new Date().toISOString(), status: 'requested', note: body.reason, by: req.user!.email }],
      })
      .returning();
    res.status(201).json({ id: ret!.id, status: ret!.status });
  }));
  r.get('/returns', wrap(async (req, res) => {
    const list = await db().select().from(returns).where(eq(returns.email, req.user!.email)).orderBy(desc(returns.createdAt));
    res.json({ items: list.map((x) => ({ id: x.id, orderNumber: x.orderNumber, status: x.status, reason: x.reason, createdAt: x.createdAt.toISOString() })) });
  }));

  /* wishlist */
  r.get('/wishlist', wrap(async (req, res) => {
    const [w] = await db().select().from(wishlists).where(eq(wishlists.userId, req.user!.id));
    const ids = w?.productIds ?? [];
    const rows = ids.length ? await db().select().from(products).where(and(inArray(products.id, ids), eq(products.status, 'published'))) : [];
    res.json({ ids, items: (await hydrate(rows)).map(toCard) });
  }));
  r.put('/wishlist', wrap(async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(entityId).max(200) }), req.body);
    await db().insert(wishlists).values({ userId: req.user!.id, productIds: ids }).onConflictDoUpdate({ target: wishlists.userId, set: { productIds: ids, updatedAt: new Date() } });
    res.json({ ids });
  }));

  /* persistent cart */
  r.get('/cart', wrap(async (req, res) => {
    const [c] = await db().select().from(carts).where(eq(carts.userId, req.user!.id));
    res.json({ lines: c?.lines ?? [] });
  }));
  r.put('/cart', wrap(async (req, res) => {
    const { lines } = parse(z.object({ lines: z.array(cartLineSchema).max(30) }), req.body);
    await db().insert(carts).values({ userId: req.user!.id, lines }).onConflictDoUpdate({ target: carts.userId, set: { lines, updatedAt: new Date() } });
    res.json({ lines });
  }));

  /* privacy: account deletion request (processed by staff; orders kept as legally required) */
  r.post('/delete-request', wrap(async (req, res) => {
    await db().update(users).set({ deletionRequestedAt: new Date() }).where(eq(users.id, req.user!.id));
    await audit(req, 'account.delete_requested', 'user', req.user!.id, 'Customer requested account deletion');
    res.json({ ok: true });
  }));
  r.post('/logout-all', wrap(async (req, res) => {
    const [u] = await db().select({ tv: users.tokenVersion }).from(users).where(eq(users.id, req.user!.id));
    await db().update(users).set({ tokenVersion: (u?.tv ?? 0) + 1 }).where(eq(users.id, req.user!.id));
    clearSession(res);
    res.json({ ok: true });
  }));

  return r;
}
