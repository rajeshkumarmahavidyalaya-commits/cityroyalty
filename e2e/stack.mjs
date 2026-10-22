// Boots an isolated stack for the Playwright suite: in-memory MongoDB, seeded API, and production builds of web + admin.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORTS = { api: 4100, web: 3100, admin: 3101 };
const children = [];
let mongod, media;

async function waitFor(url, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${label} did not start`);
}
// async on purpose: a blocked event loop stops us draining mongod's stdout pipe, which then stalls the database
const run = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed (${code})`))));
  });

export async function up() {
  mongod = await MongoMemoryServer.create();
  media = mkdtempSync(path.join(tmpdir(), 'cr-e2e-media-'));
  const env = {
    ...process.env, NODE_ENV: 'development', MONGODB_URI: mongod.getUri('cityroyalty_e2e'), JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e', STORAGE_LOCAL_DIR: media, PUBLIC_MEDIA_URL: '/media',
    PAYMENT_MOCK_ENABLED: 'true', RATE_LIMIT_DISABLED: 'true', REVALIDATE_SECRET: 'e2e-revalidate-secret', REVALIDATE_URL: `http://localhost:${PORTS.web}/api/revalidate`, MOCK_WEBHOOK_SECRET: 'e2e-webhook', PUBLIC_WEB_URL: `http://localhost:${PORTS.web}`, PORT: String(PORTS.api), LOG_LEVEL: 'warn',
    API_URL: `http://localhost:${PORTS.api}`, NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_SITE_URL: `http://localhost:${PORTS.web}`, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_FORCE_3D: '1',
  };
  writeFileSync(path.join(media, '.env.json'), JSON.stringify({ mongo: env.MONGODB_URI }));
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
  await mongod?.stop();
  if (media) rmSync(media, { recursive: true, force: true });
}
