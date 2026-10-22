// Persistent local Postgres for development: `npm run dev:db -w @cityroyalty/api`,
// then DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/cityroyalty (the default) and RUN_MIGRATIONS=true.
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';

const databaseDir = process.env.PG_DATA_DIR ?? '.data/postgres'; // override when running as root (initdb drops to an unprivileged user)
const fresh = !existsSync(databaseDir);
const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'postgres', port: 54329, persistent: true });
if (fresh) await pg.initialise();
await pg.start();
const admin = postgres('postgres://postgres:postgres@127.0.0.1:54329/postgres', { max: 1, onnotice: () => {} });
if (!(await admin`select 1 from pg_database where datname = 'cityroyalty'`).length) await admin.unsafe('create database cityroyalty');
await admin.end();
console.log('Postgres dev server running on 127.0.0.1:54329 (Ctrl+C to stop; data in apps/api/.data/postgres)');
process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
