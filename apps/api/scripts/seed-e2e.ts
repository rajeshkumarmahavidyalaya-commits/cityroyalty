import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { hashPassword } from '../src/lib/auth';
import { loadConfig } from '../src/config';
import { connectDb, disconnectDb } from '../src/lib/db';
import { processImage } from '../src/lib/images';
import { DEFAULT_SETTINGS, saveSettings } from '../src/lib/settings';
import { createStorage } from '../src/lib/storage';
import { Asset, Discount, Product, User } from '../src/models';
import { importWooSnapshot } from '../src/services/importer';

/** Deterministic fixture for the Playwright suite. Photos are generated locally (no network); stock is test data. */
const config = loadConfig();
if (config.isProd) throw new Error('never run in production');
await connectDb(config.MONGODB_URI);
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
  const p = await Product.findOne({ sku });
  if (!p) continue;
  for (let n = 0; n < 2; n++) {
    const out = await processImage(await photo(`${p.title} ${n + 1}`, HUES[(i + n) % HUES.length]!), storage);
    const asset = await Asset.findOneAndUpdate({ key: out.key }, { $set: { key: out.key, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } }, { upsert: true, returnDocument: 'after' });
    p.images.push({ slot: n === 0 ? 'front' : 'back', kind: 'photo', assetId: asset!._id, alt: `${p.title} — fixture photo ${n + 1}`, position: n, width: out.width, height: out.height, src: out.src, avif: out.avif, webp: out.webp, blur: out.blur } as any);
  }
  p.variants.forEach((v) => {
    v.stock = 5;
    if (sku === 'BIKBRNJK4' && (v.options as unknown as Map<string, string>).get('Size') === 'S-42') v.stock = 0; // a sold-out size
    if (sku === 'CRBLMGN02') v.stock = 1; // last unit, for the oversell test
  });
  await p.save();
  p.status = 'published';
  p.publishedAt = new Date(Date.now() - i * 3600_000);
  p.featured = i < 4;
  await p.save();
  i++;
}
// one draft with a photo, to prove drafts never leak
const draft = await Product.findOne({ sku: 'DGNJK1' });
if (draft) { draft.status = 'draft'; await draft.save(); }

await Discount.updateOne({ code: 'WELCOME10' }, { $set: { type: 'percent', value: 10, active: true } }, { upsert: true });
const pw = await hashPassword('E2e-password-1');
for (const [email, role] of [['admin@e2e.test', 'admin'], ['manager@e2e.test', 'manager'], ['content@e2e.test', 'content'], ['customer@e2e.test', 'customer']] as const) {
  await User.updateOne({ email }, { $set: { name: `E2E ${role}`, role, passwordHash: pw } }, { upsert: true });
}
console.log(`e2e seed ok: ${i} published`);
await disconnectDb();
