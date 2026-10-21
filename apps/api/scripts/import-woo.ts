import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
import { connectDb, disconnectDb } from '../src/lib/db';
import { createStorage } from '../src/lib/storage';
import { importWooSnapshot } from '../src/services/importer';

// usage: npm run import:woo -w @cityroyalty/api -- [--images] [--limit 10] [--dir path]
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => args[args.indexOf(`--${n}`) + 1];
const here = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
await connectDb(config.MONGODB_URI);
const report = await importWooSnapshot({
  dir: val('dir') ?? path.join(here, '../data/woo-snapshot'),
  storage: flag('images') ? createStorage(config) : undefined,
  downloadImages: flag('images'),
  limit: flag('limit') ? Number(val('limit')) : undefined,
  cacheDir: path.join(here, '../.cache/woo-images'),
  log: (m) => console.log(m),
});
console.log(JSON.stringify(report, null, 2));
await disconnectDb();
