import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

let client: postgres.Sql | null = null;
let instance: Db | null = null;

export function connectDb(url: string, opts: { max?: number; maxPipeline?: number } = {}): Db {
  // prepare:false keeps us compatible with Supabase's transaction-mode pooler (port 6543).
  // maxPipeline 1 stops postgres-js pipelining concurrent queries on one connection, which the pooler can stall on.
  // max_pipeline is a runtime option of postgres-js that its type definitions omit
  const pipeline = { max_pipeline: opts.maxPipeline ?? 100 } as object;
  client = postgres(url, { prepare: false, max: opts.max ?? 10, idle_timeout: 20, connect_timeout: 15, onnotice: () => {}, ...pipeline });
  instance = drizzle(client, { schema, casing: 'snake_case' });
  return instance;
}

export function db(): Db {
  if (!instance) throw new Error('Database not connected — call connectDb() first');
  return instance;
}

export async function disconnectDb() {
  await client?.end({ timeout: 5 });
  client = null;
  instance = null;
}

/** Applies the SQL files in apps/api/drizzle (used by dev/test; production runs them as Supabase migrations). */
export async function runMigrations() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle')];
  const { existsSync } = await import('node:fs');
  const folder = candidates.find((c) => existsSync(path.join(c, 'meta', '_journal.json')));
  if (!folder) throw new Error('migrations folder not found');
  await migrate(db(), { migrationsFolder: folder, migrationsSchema: 'cr' });
}

export { schema };
