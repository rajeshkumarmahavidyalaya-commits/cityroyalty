import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import request from 'supertest';
import { buildDeps, createApp, type Deps } from '../src/app';
import { loadConfig } from '../src/config';
import { connectDb, db, disconnectDb, runMigrations } from '../src/db';
import { collections, discounts, orders, payments, productImages, products, users, variants } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';
import { DEFAULT_SETTINGS, saveSettings } from '../src/lib/settings';
import { loadOrder } from '../src/services/orders';
import { loadProduct, refreshProduct } from '../src/services/products';

export async function startTestApp(env: Record<string, string> = {}) {
  const base = process.env.TEST_PG_URL!;
  const name = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(`${base}/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const dir = mkdtempSync(path.join(tmpdir(), 'cr-test-'));
  const config = loadConfig({
    NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), PAYMENT_MOCK_ENABLED: 'true', STORAGE_LOCAL_DIR: dir, MOCK_WEBHOOK_SECRET: 'whsec_test',
    PUBLIC_WEB_URL: 'https://shop.test', DATABASE_URL: `${base}/${name}`, ...env,
  } as NodeJS.ProcessEnv);
  connectDb(config.DATABASE_URL, { max: 20 });
  await runMigrations();
  const deps = buildDeps(config);
  const app = createApp(deps);
  const defaults = { ...DEFAULT_SETTINGS, shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: 9900 } };
  await saveSettings(defaults);
  return {
    app, deps, config,
    async reset() {
      const tables = await db().execute<{ t: string }>(sql`select tablename as t from pg_tables where schemaname = 'cr' and tablename <> '__drizzle_migrations'`);
      await db().execute(sql.raw(`truncate ${(tables as unknown as { t: string }[]).map((r) => `cr."${r.t}"`).join(', ')} restart identity cascade`));
      await db().execute(sql`select setval('cr.order_number_seq', 1, false)`);
      await saveSettings(defaults);
      deps.mailer.outbox.length = 0;
    },
    async stop() {
      await disconnectDb();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A logged-in browser session (cookie jar + CSRF header). */
export class Session {
  cookie = '';
  csrf = '';
  constructor(private app: Parameters<typeof request>[0]) {}
  private absorb(res: request.Response) {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    if (!set) return;
    const jar = new Map(this.cookie.split('; ').filter(Boolean).map((c) => c.split('=') as [string, string]));
    for (const c of set) {
      const [kv] = c.split(';');
      const [k, ...v] = kv!.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c)) jar.delete(k!);
      else jar.set(k!, v.join('='));
    }
    this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    this.csrf = jar.get('cr_csrf') ?? '';
  }
  private build(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string) {
    const r = request(this.app)[method](url);
    if (this.cookie) r.set('Cookie', this.cookie);
    if (this.csrf) r.set('x-csrf-token', this.csrf);
    return r;
  }
  async send(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown) {
    const r = this.build(method, url);
    const res = await (body === undefined ? r : r.send(body as object));
    this.absorb(res);
    return res;
  }
  get = (u: string) => this.send('get', u);
  post = (u: string, b?: unknown) => this.send('post', u, b ?? {});
  put = (u: string, b: unknown) => this.send('put', u, b);
  patch = (u: string, b: unknown) => this.send('patch', u, b);
  delete = (u: string) => this.send('delete', u);
  raw(method: 'post' | 'put', url: string) {
    return this.build(method, url);
  }
  async login(email: string, password: string) {
    const res = await this.post('/api/v1/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
    return this;
  }
}

export async function makeUser(role: 'customer' | 'content' | 'manager' | 'admin', email = `${role}@t.test`, password = 'Passw0rd-12345') {
  await db().insert(users).values({ name: `${role} user`, email, role, passwordHash: await hashPassword(password) });
  return { email, password };
}
export async function sessionFor(app: Parameters<typeof request>[0], role: Parameters<typeof makeUser>[0], email?: string) {
  const u = await makeUser(role, email);
  return new Session(app).login(u.email, u.password);
}

export const photo = (alt = 'photo') => ({
  slot: 'front', kind: 'photo', alt, width: 1200, height: 1500, src: 'https://cdn.test/a-1280.webp',
  avif: [{ w: 640, url: 'https://cdn.test/a-640.avif' }], webp: [{ w: 640, url: 'https://cdn.test/a-640.webp' }, { w: 1280, url: 'https://cdn.test/a-1280.webp' }],
});

export async function makeCollection(slug = 'mens-jacket', title = "Men's Jackets", parent: string | null = null) {
  const [c] = await db().insert(collections).values({ slug, title, parent, active: true }).returning();
  return c!;
}

export interface MakeProduct {
  title?: string; slug?: string; status?: 'draft' | 'review' | 'published'; stock?: number | null; price?: number;
  sizes?: string[]; collections?: string[]; images?: ReturnType<typeof photo>[]; madeToOrder?: boolean; featured?: boolean; compareAt?: number;
}
export async function makeProduct(o: MakeProduct = {}) {
  const sizes = o.sizes ?? ['M-44', 'L-46'];
  const [p] = await db()
    .insert(products)
    .values({
      title: o.title ?? 'Test Biker Jacket', slug: o.slug ?? `test-biker-jacket-${Math.random().toString(36).slice(2, 7)}`, sku: 'TST1',
      status: o.status ?? 'published', collections: o.collections ?? ['mens-jacket'], featured: o.featured ?? false, publishedAt: new Date(),
      options: [{ name: 'Size', values: sizes }],
    })
    .returning();
  await db().insert(variants).values(
    sizes.map((s, i) => ({ productId: p!.id, sku: `TST1-${s}`, options: { Size: s }, price: o.price ?? 799900, compareAtPrice: o.compareAt ?? 1599900, stock: o.stock === undefined ? 5 : o.stock, madeToOrder: o.madeToOrder ?? false, active: true, position: i })),
  );
  const imgs = o.images ?? [photo('Test Biker Jacket')];
  if (imgs.length) await db().insert(productImages).values(imgs.map((im, i) => ({ ...im, productId: p!.id, position: i })));
  await refreshProduct(p!.id);
  return (await loadProduct(p!.id))!;
}
export type { Deps };

export const address = { fullName: 'Asha Verma', phone: '9876543210', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560001' };
export const checkoutBody = (p: { id: string; variants: { id: string }[] }, over: Record<string, unknown> = {}) => ({
  lines: [{ productId: p.id, variantId: p.variants[0]!.id, qty: 1 }],
  email: 'buyer@t.test', shippingAddress: address, provider: 'mock', idempotencyKey: 'k'.repeat(8) + Math.random().toString(36).slice(2, 12), ...over,
});

/** current stock of a product's n-th variant */
export const stockOf = async (productId: string, i = 0) => (await loadProduct(productId))!.variants[i]!.stock;

/* ---------- tiny query helpers so tests read like the domain ---------- */

export const count = async (table: PgTable, where?: SQL) => Number((await db().select({ n: sql<number>`count(*)::int` }).from(table).where(where))[0]!.n);
export const orderByNumber = (number: string) => loadOrder({ number });
export const orderById = (id: string) => loadOrder({ id });
export const firstOrder = async () => (await db().select().from(orders).limit(1))[0]!;
export const discount = async (code: string) => (await db().select().from(discounts).where(eq(discounts.code, code)))[0]!;
export const addDiscount = async (v: typeof discounts.$inferInsert) => (await db().insert(discounts).values(v).returning())[0]!;
export const paymentByProviderOrder = async (providerOrderId: string) => (await db().select().from(payments).where(eq(payments.providerOrderId, providerOrderId)))[0]!;
export const expireOrder = (number: string) => db().update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) }).where(eq(orders.number, number));
export const productBy = async (field: 'slug' | 'sku', value: string) => {
  const [row] = await db().select().from(products).where(field === 'slug' ? eq(products.slug, value) : eq(products.sku, value)).limit(1);
  return row ? loadProduct(row.id) : null;
};
