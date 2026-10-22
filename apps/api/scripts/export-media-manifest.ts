import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
import { connectDb, db, disconnectDb } from '../src/db';
import { assets } from '../src/db/schema';
import type { MediaManifestEntry } from '../src/lib/images';

/**
 * After `import:woo --images` has uploaded the photos once, record what was uploaded (keyed by the Woo image URL) so
 * other environments sharing that media storage can import without downloading and re-encoding:
 *   npm run export:media -w @cityroyalty/api
 */
const config = loadConfig();
connectDb(config.DATABASE_URL, { max: 1 });
const here = path.dirname(fileURLToPath(import.meta.url));
const snapshot = path.join(here, '../data/woo-snapshot');
const cacheDir = path.join(here, '../.cache/woo-images');
// several Woo URLs can hold identical bytes (one asset), so map every URL through its cached download's content hash
const byKey = new Map((await db().select().from(assets)).map((a) => [a.key, a]));
const urls = new Set((JSON.parse(await readFile(path.join(snapshot, 'products.json'), 'utf8')) as { images: { src: string }[] }[]).flatMap((p) => p.images.map((i) => i.src)));
const manifest: Record<string, MediaManifestEntry> = {};
let missing = 0;
for (const url of [...urls].sort()) {
  const file = path.join(cacheDir, createHash('sha1').update(url).digest('hex') + path.extname(new URL(url).pathname));
  const a = existsSync(file) ? byKey.get(createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16)) : undefined;
  if (!a) {
    missing++;
    continue;
  }
  manifest[url] = { key: a.key, width: a.width!, height: a.height!, bytes: a.bytes ?? 0, widths: a.webp.map((s) => s.w), blur: a.blur ?? '' };
}
const out = path.join(snapshot, 'media-manifest.json');
await writeFile(out, JSON.stringify(manifest, null, 1) + '\n');
console.log(`wrote ${Object.keys(manifest).length} of ${urls.size} image URLs to ${path.relative(process.cwd(), out)} (${missing} not uploaded yet)`);
await disconnectDb();
