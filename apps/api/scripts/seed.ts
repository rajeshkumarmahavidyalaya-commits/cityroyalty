import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/auth';
import { connectDb, disconnectDb } from '../src/lib/db';
import { createStorage } from '../src/lib/storage';
import { saveSettings, DEFAULT_SETTINGS } from '../src/lib/settings';
import { loadConfig } from '../src/config';
import { Campaign, Discount, Product, User } from '../src/models';
import { importWooSnapshot } from '../src/services/importer';

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

await connectDb(config.MONGODB_URI);
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
  const products = await Product.find({ 'images.0': { $exists: true } });
  let n = 0;
  for (const p of products) {
    p.variants.forEach((v) => {
      if (v.stock == null && v.price > 0) v.stock = 12;
    });
    await p.save();
    if (!p.blockers.length) {
      p.status = 'published';
      p.publishedAt = new Date();
      p.featured = n < 6;
      await p.save();
      n++;
    }
  }
  await Discount.updateOne({ code: 'WELCOME10' }, { $set: { type: 'percent', value: 10, minSubtotal: 0, active: true } }, { upsert: true });
  await Campaign.updateOne(
    { key: 'announcement' },
    { $set: { headline: 'Free shipping on orders over ₹600', ctaHref: '/collections/all', ctaLabel: 'Shop now', active: true } },
    { upsert: true },
  );
  await User.updateOne({ email: 'admin@cityroyalty.test' }, { $set: { name: 'Demo Admin', role: 'admin', passwordHash: await hashPassword('Demo-admin-1234') } }, { upsert: true });
  await User.updateOne({ email: 'customer@cityroyalty.test' }, { $set: { name: 'Demo Customer', role: 'customer', passwordHash: await hashPassword('Demo-customer-1234') } }, { upsert: true });
  console.log(`DEMO data: ${n} products published with demo stock=12; admin@cityroyalty.test / Demo-admin-1234; coupon WELCOME10. NEVER use in production.`);
}
await disconnectDb();
