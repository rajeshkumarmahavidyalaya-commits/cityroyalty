// Boots an isolated stack for the Playwright suite: throwaway Postgres, seeded API, and production builds of web + admin.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORTS = { api: 4100, web: 3100, admin: 3101, db: 54400 };
const children = [];
let pg, pgDir, media;

async function waitFor(url, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${label} did not start`);
}
// async on purpose: a blocked event loop would stop us draining the children's output pipes
const run = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed (${code})`))));
  });

export async function up() {
  pgDir = path.join(tmpdir(), `cr-e2e-pg-${process.pid}`); // initdb creates it (it runs unprivileged, so no 0700 mkdtemp dir)
  pg = new EmbeddedPostgres({ databaseDir: pgDir, user: 'postgres', password: 'postgres', port: PORTS.db, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${PORTS.db}/postgres`, { max: 1, onnotice: () => {} });
  await admin.unsafe('create database cityroyalty_e2e');
  await admin.end();
  media = mkdtempSync(path.join(tmpdir(), 'cr-e2e-media-'));
  const env = {
    ...process.env, NODE_ENV: 'development', DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORTS.db}/cityroyalty_e2e`, JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e', STORAGE_LOCAL_DIR: media, PUBLIC_MEDIA_URL: '/media',
    PAYMENT_MOCK_ENABLED: 'true', RATE_LIMIT_DISABLED: 'true', REVALIDATE_SECRET: 'e2e-revalidate-secret', REVALIDATE_URL: `http://localhost:${PORTS.web}/api/revalidate`, MOCK_WEBHOOK_SECRET: 'e2e-webhook', PUBLIC_WEB_URL: `http://localhost:${PORTS.web}`, PORT: String(PORTS.api), LOG_LEVEL: 'warn',
    API_URL: `http://localhost:${PORTS.api}`, NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORTS.web}`, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_INDEXABLE: 'true',
  };
  await run('npx', ['tsx', 'apps/api/scripts/seed-e2e.ts'], { env });
  children.push(spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: root, env, stdio: 'inherit', detached: true }));
  await waitFor(`http://localhost:${PORTS.api}/health`, 'API');
  const nextEnv = { ...env, NODE_ENV: 'production' }; // Next must build/run as production
  for (const app of ['web', 'admin']) {
    // always rebuild by default: prerendered pages embed product ids from the DB they were built against
    const dist = path.join(root, `apps/${app}/.next-e2e`);
    // the build's fetch cache would otherwise replay product ids from a previous run's database
    if (!process.env.E2E_SKIP_BUILD) rmSync(dist, { recursive: true, force: true });
    if (!existsSync(path.join(dist, 'BUILD_ID'))) await run('npx', ['next', 'build'], { cwd: path.join(root, `apps/${app}`), env: nextEnv });
    children.push(spawn('npx', ['next', 'start', '-p', String(PORTS[app])], { cwd: path.join(root, `apps/${app}`), env: nextEnv, stdio: 'inherit', detached: true }));
  }
  await waitFor(`http://localhost:${PORTS.web}/`, 'web');
  await waitFor(`http://localhost:${PORTS.admin}/login`, 'admin');
  return env;
}

export async function down() {
  // npx spawns grandchildren: signal the whole process group so no server outlives the run
  for (const c of children) {
    try { process.kill(-c.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  await new Promise((r) => setTimeout(r, 500));
  await pg?.stop();
  if (pgDir) rmSync(pgDir, { recursive: true, force: true });
  if (media) rmSync(media, { recursive: true, force: true });
}
