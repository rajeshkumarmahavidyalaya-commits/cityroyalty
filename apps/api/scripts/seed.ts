import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { connectDb, db, disconnectDb, runMigrations } from '../src/db';
import { campaigns, discounts, productImages, products, users, variants } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';
import { DEFAULT_SETTINGS, saveSettings } from '../src/lib/settings';
import { createStorage } from '../src/lib/storage';
import { importWooSnapshot } from '../src/services/importer';
import { refreshProduct } from '../src/services/products';

/**
 * Development / staging seed.
 *   npm run seed -w @cityroyalty/api               → settings + imported catalogue (all drafts)
 *   npm run seed -w @cityroyalty/api -- --demo     → ALSO fills demo stock, publishes products that have photos,
 *                                                    creates demo accounts and a sample discount.
 * --demo invents stock levels and a test password, so it is refused in production.
 */
const config = loadConfig();
const demo = process.argv.includes('--demo');
const images = process.argv.includes('--images');
if (demo && config.isProd) throw new Error('--demo is not allowed in production');
const here = path.dirname(fileURLToPath(import.meta.url));

connectDb(config.DATABASE_URL, { max: 4 });
if (process.argv.includes('--migrate')) await runMigrations();
await saveSettings({ ...DEFAULT_SETTINGS, ...(demo ? { shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: 9900, estimate: 'DEMO: 4–7 working days' } } : {}) });
const report = await importWooSnapshot({
  dir: path.join(here, '../data/woo-snapshot'),
  storage: images ? createStorage(config) : undefined,
  downloadImages: images,
  cacheDir: path.join(here, '../.cache/woo-images'),
  log: (m) => console.log(m),
});
console.log(JSON.stringify({ ...report, ambiguous: report.ambiguous.length }, null, 2));

if (demo) {
  const withPhotos = await db().selectDistinct({ id: productImages.productId }).from(productImages).where(eq(productImages.kind, 'photo'));
  let n = 0;
  for (const { id } of withPhotos) {
    await db().update(variants).set({ stock: 12 }).where(and(eq(variants.productId, id), isNull(variants.stock), sql`${variants.price} > 0`));
    const p = await refreshProduct(id);
    if (p && !p.blockers.length) {
      await db().update(products).set({ status: 'published', publishedAt: new Date(), featured: n < 6 }).where(eq(products.id, id));
      n++;
    }
  }
  await db().insert(discounts).values({ code: 'WELCOME10', type: 'percent', value: 10, minSubtotal: 0, active: true }).onConflictDoUpdate({ target: discounts.code, set: { type: 'percent', value: 10, minSubtotal: 0, active: true } });
  const banner = { headline: 'Free shipping on orders over ₹600', ctaHref: '/collections/all', ctaLabel: 'Shop now', active: true };
  await db().insert(campaigns).values({ key: 'announcement', ...banner }).onConflictDoUpdate({ target: campaigns.key, set: banner });
  for (const [email, name, role, pw] of [['admin@cityroyalty.test', 'Demo Admin', 'admin', 'Demo-admin-1234'], ['customer@cityroyalty.test', 'Demo Customer', 'customer', 'Demo-customer-1234']] as const) {
    const passwordHash = await hashPassword(pw);
    await db().insert(users).values({ email, name, role, passwordHash }).onConflictDoUpdate({ target: users.email, set: { name, role, passwordHash } });
  }
  console.log(`DEMO data: ${n} products published with demo stock=12; admin@cityroyalty.test / Demo-admin-1234; coupon WELCOME10. NEVER use in production.`);
}
await disconnectDb();
