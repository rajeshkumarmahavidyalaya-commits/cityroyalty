import { loadConfig } from './config';
import { buildDeps, createApp } from './app';
import { connectDb, disconnectDb, runMigrations } from './db';
import { logger } from './logger';

const config = loadConfig();
connectDb(config.DATABASE_URL, { max: config.DB_POOL_MAX });
if (process.env.RUN_MIGRATIONS === 'true') await runMigrations();
const deps = buildDeps(config);
const app = createApp(deps);

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT, env: config.NODE_ENV, providers: Object.keys(deps.adapters) }, 'API listening'));

// release stock held by abandoned payments (serverless deployments rely on the lazy sweep in the checkout routes)
const sweep = setInterval(() => {
  deps.orders.expireStale().then((n) => n && logger.info({ n }, 'expired stale payment holds')).catch((err) => logger.error({ err }, 'expiry sweep failed'));
}, 60_000);
sweep.unref();

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  clearInterval(sweep);
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
