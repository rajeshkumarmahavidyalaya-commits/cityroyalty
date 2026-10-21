import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { buildDeps, createApp, type Deps } from '../src/app';
import { loadConfig } from '../src/config';
import { hashPassword } from '../src/lib/auth';
import { saveSettings, DEFAULT_SETTINGS } from '../src/lib/settings';
import { Collection, Product, User } from '../src/models';

export async function startTestApp(env: Record<string, string> = {}) {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'test' });
  const dir = mkdtempSync(path.join(tmpdir(), 'cr-test-'));
  const config = loadConfig({
    NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), PAYMENT_MOCK_ENABLED: 'true', STORAGE_LOCAL_DIR: dir, MOCK_WEBHOOK_SECRET: 'whsec_test',
    PUBLIC_WEB_URL: 'https://shop.test', ...env,
  } as NodeJS.ProcessEnv);
  const deps = buildDeps(config);
  const app = createApp(deps);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await saveSettings({ ...DEFAULT_SETTINGS, shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: 9900 } });
  return {
    app, deps, config,
    async reset() {
      await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
      await saveSettings({ ...DEFAULT_SETTINGS, shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: 9900 } });
      deps.mailer.outbox.length = 0;
    },
    async stop() {
      await mongoose.disconnect();
      await mongod.stop();
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
  await User.create({ name: `${role} user`, email, role, passwordHash: await hashPassword(password) });
  return { email, password };
}
export async function sessionFor(app: Parameters<typeof request>[0], role: Parameters<typeof makeUser>[0], email?: string) {
  const u = await makeUser(role, email);
  return new Session(app).login(u.email, u.password);
}

const photo = (alt = 'photo') => ({
  slot: 'front', kind: 'photo', alt, width: 1200, height: 1500, src: 'https://cdn.test/a-1280.webp',
  avif: [{ w: 640, url: 'https://cdn.test/a-640.avif' }], webp: [{ w: 640, url: 'https://cdn.test/a-640.webp' }, { w: 1280, url: 'https://cdn.test/a-1280.webp' }],
});

export async function makeCollection(slug = 'mens-jacket', title = "Men's Jackets", parent: string | null = null) {
  return Collection.create({ slug, title, parent, active: true });
}

export interface MakeProduct {
  title?: string; slug?: string; status?: 'draft' | 'review' | 'published'; stock?: number | null; price?: number;
  sizes?: string[]; collections?: string[]; images?: object[]; madeToOrder?: boolean; featured?: boolean; compareAt?: number;
}
export async function makeProduct(o: MakeProduct = {}) {
  const sizes = o.sizes ?? ['M-44', 'L-46'];
  const p = await Product.create({
    title: o.title ?? 'Test Biker Jacket', slug: o.slug ?? `test-biker-jacket-${Math.random().toString(36).slice(2, 7)}`, sku: 'TST1',
    status: o.status ?? 'published', collections: o.collections ?? ['mens-jacket'], featured: o.featured ?? false, publishedAt: new Date(),
    options: [{ name: 'Size', values: sizes }],
    variants: sizes.map((s) => ({ sku: `TST1-${s}`, options: { Size: s }, price: o.price ?? 799900, compareAtPrice: o.compareAt ?? 1599900, stock: o.stock === undefined ? 5 : o.stock, madeToOrder: o.madeToOrder ?? false, active: true })),
    images: o.images ?? [photo(`Test Biker Jacket`)],
  });
  return p;
}
export { photo };
export type { Deps };

export const address = { fullName: 'Asha Verma', phone: '9876543210', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pin: '560001' };
export const checkoutBody = (p: { _id: unknown; variants: { _id: unknown }[] }, over: Record<string, unknown> = {}) => ({
  lines: [{ productId: String(p._id), variantId: String(p.variants[0]!._id), qty: 1 }],
  email: 'buyer@t.test', shippingAddress: address, provider: 'mock', idempotencyKey: 'k'.repeat(8) + Math.random().toString(36).slice(2, 12), ...over,
});
