// Entry for Vercel Functions: the same Express app, without listen() or background timers.
import { buildDeps, createApp } from './app';
import { loadConfig } from './config';
import { connectDb } from './db';

const config = loadConfig();
connectDb(config.DATABASE_URL, { max: config.DB_POOL_MAX, maxPipeline: config.DB_MAX_PIPELINE });
const app = createApp(buildDeps(config));

export default app;
