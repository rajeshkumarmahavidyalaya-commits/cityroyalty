import path from 'node:path';
import { loadConfig } from '../src/config';
import { connectDb, disconnectDb } from '../src/db';
import { createStorage } from '../src/lib/storage';
import { importWooSnapshot, snapshotDir } from '../src/services/importer';

// usage: npm run import:woo -w @cityroyalty/api -- [--images] [--limit 10] [--dir path]
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const snapshot = snapshotDir();

const config = loadConfig();
connectDb(config.DATABASE_URL, { max: 4 });
const report = await importWooSnapshot({
  dir: val('dir') ?? snapshot,
  storage: flag('images') ? createStorage(config) : undefined,
  downloadImages: flag('images'),
  limit: flag('limit') ? Number(val('limit')) : undefined,
  cacheDir: path.join(snapshot, '../../.cache/woo-images'),
  log: (m) => console.log(m),
});
console.log(JSON.stringify(report, null, 2));
await disconnectDb();
