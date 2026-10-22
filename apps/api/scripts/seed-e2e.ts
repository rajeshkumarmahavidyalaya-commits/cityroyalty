import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { loadConfig } from '../src/config';
import { connectDb, db, disconnectDb, runMigrations } from '../src/db';
import { assets, discounts, productImages, products, users, variants } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';
import { processImage } from '../src/lib/images';
import { DEFAULT_SETTINGS, saveSettings } from '../src/lib/settings';
import { createStorage } from '../src/lib/storage';
import { importWooSnapshot } from '../src/services/importer';
import { refreshProduct } from '../src/services/products';

/** Deterministic fixture for the Playwright suite. Photos are generated locally (no network); stock is test data. */
const config = loadConfig();
if (config.isProd) throw new Error('never run in production');
connectDb(config.DATABASE_URL, { max: 4 });
await runMigrations();
const storage = createStorage(config);
const here = path.dirname(fileURLToPath(import.meta.url));
await saveSettings({ ...DEFAULT_SETTINGS, supportEmail: 'support@cityroyalty.test', shipping: { ...DEFAULT_SETTINGS.shipping, flatRate: 9900, estimate: 'Test estimate: 4–7 working days' } });
await importWooSnapshot({ dir: path.join(here, '../data/woo-snapshot'), log: () => {} });

const photo = async (title: string, hue: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hue}"/><stop offset="1" stop-color="#1a0f0a"/></linearGradient></defs><rect width="1200" height="1500" fill="url(#g)"/><text x="600" y="760" font-size="54" fill="#f7f4ee" text-anchor="middle" font-family="sans-serif">${title.replace(/[<&]/g, '')}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};
const HUES = ['#6d4424', '#2b2b2b', '#5c1522', '#16254a', '#8b5e3c', '#3b2014'];
const picks = ['BIKBRNJK4', 'CRBGWSC01', 'CRBLMGN01', 'OFFWTWJK1', 'MRWJK1', 'BLKJK2', 'CRBGUDF01', 'CRBLMGN02', 'DBLUWJK1', 'CHWJK1', 'CRBGWHB01', 'BIKBLACKJK1'];
let i = 0;
for (const sku of picks) {
  const [p] = await db().select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!p) continue;
  for (let n = 0; n < 2; n++) {
    const out = await processImage(await photo(`${p.title} ${n + 1}`, HUES[(i + n) % HUES.length]!), storage);
    const media = { width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur };
    const [asset] = await db().insert(assets).values({ key: out.key, ...media }).onConflictDoUpdate({ target: assets.key, set: media }).returning();
    await db().insert(productImages).values({ productId: p.id, slot: n === 0 ? 'front' : 'back', kind: 'photo', assetId: asset!.id, alt: `${p.title} — fixture photo ${n + 1}`, position: n, ...media });
  }
  for (const v of await db().select().from(variants).where(eq(variants.productId, p.id))) {
    let stock = 5;
    if (sku === 'BIKBRNJK4' && v.options.Size === 'S-42') stock = 0; // a sold-out size
    if (sku === 'CRBLMGN02') stock = 1; // last unit, for the oversell test
    await db().update(variants).set({ stock }).where(eq(variants.id, v.id));
  }
  await refreshProduct(p.id);
  await db().update(products).set({ status: 'published', publishedAt: new Date(Date.now() - i * 3600_000), featured: i < 4 }).where(eq(products.id, p.id));
  i++;
}
// one draft with a photo, to prove drafts never leak
await db().update(products).set({ status: 'draft' }).where(eq(products.sku, 'DGNJK1'));

await db().insert(discounts).values({ code: 'WELCOME10', type: 'percent', value: 10, active: true }).onConflictDoUpdate({ target: discounts.code, set: { type: 'percent', value: 10, active: true } });
const passwordHash = await hashPassword('E2e-password-1');
for (const [email, role] of [['admin@e2e.test', 'admin'], ['manager@e2e.test', 'manager'], ['content@e2e.test', 'content'], ['customer@e2e.test', 'customer']] as const) {
  await db().insert(users).values({ email, name: `E2E ${role}`, role, passwordHash }).onConflictDoUpdate({ target: users.email, set: { name: `E2E ${role}`, role, passwordHash } });
}
console.log(`e2e seed ok: ${i} published`);
await disconnectDb();
