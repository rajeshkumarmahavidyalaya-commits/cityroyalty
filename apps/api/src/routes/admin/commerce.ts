import { Router } from 'express';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ORDER_STATUSES, discountInputSchema, inventoryAdjustSchema, orderStatusUpdateSchema, refundSchema, returnUpdateSchema, shipmentInputSchema } from '@cityroyalty/shared';
import type { Deps } from '../../app';
import { db } from '../../db';
import { addresses, discounts, orders, payments, products, returns, shipments, subscribers, users, variants } from '../../db/schema';
import { audit } from '../../lib/audit';
import { requireRole } from '../../lib/auth';
import { conflict, notFound } from '../../lib/errors';
import { contains, idParam, parse, wrap } from '../../lib/http';
import { loadOrder, shipmentsFor, toOrderDTO, withLines } from '../../services/orders';
import { refreshProduct } from '../../services/products';

const discountDTO = (d: typeof discounts.$inferSelect) => ({ ...d, id: d.id, startsAt: d.startsAt?.toISOString(), endsAt: d.endsAt?.toISOString() });
const PAID = ['paid', 'processing', 'shipped', 'delivered'];

export function adminCommerceRoutes({ orders: svc, revalidate }: Deps) {
  const r = Router();
  const mgr = requireRole('manager', 'admin');

  /* ---------- orders ---------- */
  r.get('/orders', mgr, wrap(async (req, res) => {
    const { status, q, page = '1' } = req.query as Record<string, string | undefined>;
    const conds: (SQL | undefined)[] = [];
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) conds.push(eq(orders.status, status));
    if (q) conds.push(or(ilike(orders.number, contains(q)), ilike(orders.email, contains(q)), sql`${orders.shippingAddress}->>'fullName' ilike ${contains(q)}`));
    const where = and(...conds);
    const limit = 30;
    const pg = Math.max(1, Number(page) || 1);
    const [rows, [{ n }]] = (await Promise.all([
      db().select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(limit).offset((pg - 1) * limit),
      db().select({ n: sql<number>`count(*)::int` }).from(orders).where(where),
    ])) as [typeof orders.$inferSelect[], [{ n: number }]];
    res.json({ items: (await withLines(rows)).map((o) => ({ ...toOrderDTO(o), flags: o.flags })), page: pg, pages: Math.max(1, Math.ceil(n / limit)), total: n });
  }));

  r.get('/orders/:id', mgr, wrap(async (req, res) => {
    const o = await loadOrder({ id: idParam(req) });
    if (!o) throw notFound('Order');
    const [ships, pays] = await Promise.all([shipmentsFor(o.id), db().select().from(payments).where(eq(payments.orderId, o.id)).orderBy(desc(payments.createdAt))]);
    res.json({
      ...toOrderDTO(o, ships), flags: o.flags, refundedTotal: o.refundedTotal, notes: o.notes,
      payments: pays.map((p) => ({ id: p.id, provider: p.provider, status: p.status, amount: p.amount, providerPaymentId: p.providerPaymentId, refunds: p.refunds })),
    });
  }));

  r.post('/orders/:id/status', mgr, wrap(async (req, res) => {
    const { status, note } = parse(orderStatusUpdateSchema, req.body);
    const o = await svc.setStatus(idParam(req), status, req.user!.email, note);
    await audit(req, 'order.status', 'order', o.id, `${o.number} → ${status}`);
    res.json(toOrderDTO(o));
  }));

  r.post('/orders/:id/shipments', mgr, wrap(async (req, res) => {
    const data = parse(shipmentInputSchema, req.body);
    const s = await svc.addShipment(idParam(req), data, req.user!.email);
    await audit(req, 'order.ship', 'order', idParam(req), `Shipment ${data.carrier} ${data.trackingNumber}`);
    res.status(201).json({ id: s.id });
  }));

  r.patch('/shipments/:id', mgr, wrap(async (req, res) => {
    const { status } = parse(z.object({ status: shipmentInputSchema.shape.status }), req.body);
    const [s] = await db().update(shipments).set({ status, updatedAt: new Date() }).where(eq(shipments.id, idParam(req))).returning();
    if (!s) throw notFound('Shipment');
    if (status === 'delivered') await svc.setStatus(s.orderId, 'delivered', req.user!.email, 'Delivered').catch(() => undefined);
    res.json({ ok: true });
  }));

  r.post('/orders/:id/refund', mgr, wrap(async (req, res) => {
    const { amount, reason } = parse(refundSchema, req.body);
    await svc.refund(idParam(req), amount, reason, req.user!.email);
    await audit(req, 'order.refund', 'order', idParam(req), `Refund ${amount} — ${reason}`);
    res.json({ ok: true });
  }));

  /* ---------- returns ---------- */
  r.get('/returns', mgr, wrap(async (req, res) => {
    const where = req.query.status ? eq(returns.status, String(req.query.status)) : undefined;
    const items = await db().select().from(returns).where(where).orderBy(desc(returns.createdAt)).limit(200);
    res.json({ items: items.map((x) => ({ id: x.id, orderNumber: x.orderNumber, email: x.email, status: x.status, reason: x.reason, lines: x.lines, notes: x.notes, createdAt: x.createdAt.toISOString() })) });
  }));
  r.patch('/returns/:id', mgr, wrap(async (req, res) => {
    const { status, note } = parse(returnUpdateSchema, req.body);
    const n = { at: new Date().toISOString(), status, ...(note ? { note } : {}), by: req.user!.email };
    const [ret] = await db().update(returns).set({ status, notes: sql`${returns.notes} || ${JSON.stringify([n])}::jsonb`, updatedAt: new Date() }).where(eq(returns.id, idParam(req))).returning();
    if (!ret) throw notFound('Return');
    await audit(req, 'return.update', 'return', ret.id, `${ret.orderNumber} → ${status}`);
    res.json({ ok: true });
  }));

  /* ---------- inventory ---------- */
  r.get('/inventory', mgr, wrap(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : '';
    const rows = await db()
      .select({ productId: products.id, title: products.title, status: products.status, variantId: variants.id, sku: variants.sku, active: variants.active, options: variants.options, stock: variants.stock, madeToOrder: variants.madeToOrder })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(q ? or(ilike(products.title, contains(q)), ilike(variants.sku, contains(q))) : undefined)
      .orderBy(asc(products.title), asc(variants.position))
      .limit(2000);
    res.json({ items: rows.map((x) => ({ ...x, stock: x.stock ?? null })) });
  }));
  r.post('/inventory/adjust', mgr, wrap(async (req, res) => {
    const { variantId, stock, reason } = parse(inventoryAdjustSchema, req.body);
    const [before] = await db().select({ productId: variants.productId, stock: variants.stock }).from(variants).where(eq(variants.id, variantId));
    if (!before) throw notFound('Variant');
    await db().update(variants).set({ stock }).where(eq(variants.id, variantId));
    const p = (await refreshProduct(before.productId))!; // recompute blockers / availability
    await audit(req, 'inventory.adjust', 'variant', variantId, `${p.title}: ${before.stock ?? 'unknown'} → ${stock ?? 'unknown'} (${reason})`);
    void revalidate('products', `product:${p.slug}`);
    res.json({ ok: true });
  }));

  /* ---------- discounts ---------- */
  r.get('/discounts', mgr, wrap(async (_req, res) => {
    res.json({ items: (await db().select().from(discounts).orderBy(desc(discounts.createdAt))).map(discountDTO) });
  }));
  r.post('/discounts', mgr, wrap(async (req, res) => {
    const data = parse(discountInputSchema, req.body);
    const [exists] = await db().select({ id: discounts.id }).from(discounts).where(eq(discounts.code, data.code));
    if (exists) throw conflict('That code already exists', 'duplicate');
    const [d] = await db().insert(discounts).values({ ...data, maxUses: data.maxUses ?? null, startsAt: data.startsAt ?? null, endsAt: data.endsAt ?? null }).returning();
    await audit(req, 'discount.create', 'discount', d!.id, `Created ${d!.code}`);
    res.status(201).json({ id: d!.id });
  }));
  r.put('/discounts/:id', mgr, wrap(async (req, res) => {
    const data = parse(discountInputSchema, req.body);
    const [d] = await db().update(discounts).set({ ...data, maxUses: data.maxUses ?? null, startsAt: data.startsAt ?? null, endsAt: data.endsAt ?? null, updatedAt: new Date() }).where(eq(discounts.id, idParam(req))).returning();
    if (!d) throw notFound('Discount');
    await audit(req, 'discount.update', 'discount', d.id, `Updated ${d.code}`);
    res.json({ id: d.id });
  }));
  r.delete('/discounts/:id', mgr, wrap(async (req, res) => {
    const [d] = await db().delete(discounts).where(eq(discounts.id, idParam(req))).returning();
    if (d) await audit(req, 'discount.delete', 'discount', d.id, `Deleted ${d.code}`);
    res.json({ ok: true });
  }));

  /* ---------- customers & subscribers ---------- */
  r.get('/customers', mgr, wrap(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : '';
    const list = await db()
      .select()
      .from(users)
      .where(and(eq(users.role, 'customer'), q ? or(ilike(users.name, contains(q)), ilike(users.email, contains(q))) : undefined))
      .orderBy(desc(users.createdAt))
      .limit(200);
    const emails = list.map((u) => u.email);
    const spend = emails.length
      ? await db()
          .select({ email: orders.email, orders: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${orders.total}), 0)::int` })
          .from(orders)
          .where(and(inArray(orders.email, emails), inArray(orders.status, PAID)))
          .groupBy(orders.email)
      : [];
    const m = new Map(spend.map((s) => [s.email, s]));
    res.json({
      items: list.map((u) => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone ?? null, createdAt: u.createdAt.toISOString(),
        orders: m.get(u.email)?.orders ?? 0, spent: m.get(u.email)?.spent ?? 0, deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      })),
    });
  }));

  /** Privacy: erase a customer's personal data on request. Order records are retained (tax/legal) with the contact details kept on the order only. */
  r.post('/customers/:id/anonymize', requireRole('admin'), wrap(async (req, res) => {
    const id = idParam(req);
    const [u] = await db().select().from(users).where(eq(users.id, id));
    if (!u || u.role !== 'customer') throw notFound('Customer');
    await db().transaction(async (tx) => {
      await tx.update(users).set({ name: 'Deleted customer', email: `deleted+${id}@invalid.local`, phone: null, passwordHash: 'x', deletionRequestedAt: u.deletionRequestedAt ?? new Date(), tokenVersion: u.tokenVersion + 1 }).where(eq(users.id, id));
      await tx.delete(addresses).where(eq(addresses.userId, id));
      await tx.delete(subscribers).where(eq(subscribers.email, u.email));
    });
    await audit(req, 'customer.anonymize', 'user', id, 'Customer data erased on request');
    res.json({ ok: true });
  }));

  r.get('/subscribers', mgr, wrap(async (req, res) => {
    const items = await db().select().from(subscribers).where(isNull(subscribers.unsubscribedAt)).orderBy(desc(subscribers.createdAt)).limit(5000);
    if (req.query.format === 'csv') {
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="subscribers.csv"');
      return void res.send('email,source,subscribed_at\n' + items.map((s) => `${s.email},${s.source ?? ''},${s.createdAt.toISOString()}`).join('\n'));
    }
    res.json({ items: items.map((s) => ({ id: s.id, email: s.email, source: s.source ?? null, createdAt: s.createdAt.toISOString() })), total: items.length });
  }));
  r.delete('/subscribers/:id', mgr, wrap(async (req, res) => {
    await db().delete(subscribers).where(eq(subscribers.id, idParam(req)));
    res.json({ ok: true });
  }));

  return r;
}
