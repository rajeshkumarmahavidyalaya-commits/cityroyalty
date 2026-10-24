import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Config } from './config';
import { db } from './db';
import { csrfGuard, loadUser, requireRole } from './lib/auth';
import { HttpError } from './lib/errors';
import { createMailer, type Mailer } from './lib/mailer';
import { createRevalidator, type Revalidate } from './lib/revalidate';
import { createStorage, type Storage } from './lib/storage';
import { logger } from './logger';
import { createPaymentAdapters, type PaymentAdapters } from './payments';
import { adminCommerceRoutes } from './routes/admin/commerce';
import { adminContentRoutes } from './routes/admin/content';
import { adminProductRoutes } from './routes/admin/products';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { webhookRoutes } from './routes/webhooks';
import { createOrderService, type OrderService } from './services/orders';

export interface Deps {
  config: Config;
  adapters: PaymentAdapters;
  mailer: Mailer;
  storage: Storage;
  orders: OrderService;
  revalidate: Revalidate;
  rate: { auth: RequestHandler; checkout: RequestHandler; newsletter: RequestHandler };
}

export function buildDeps(config: Config, overrides: Partial<Pick<Deps, 'adapters' | 'mailer' | 'storage'>> = {}): Deps {
  const adapters = overrides.adapters ?? createPaymentAdapters(config);
  const mailer = overrides.mailer ?? createMailer(config);
  const storage = overrides.storage ?? createStorage(config);
  const limiter = (windowMs: number, limit: number): RequestHandler =>
    config.rateLimitOff
      ? (_q, _s, n) => n()
      : rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests. Please slow down.' } } });
  return {
    config, adapters, mailer, storage,
    orders: createOrderService({ config, adapters, mailer }),
    revalidate: createRevalidator(config),
    rate: { auth: limiter(15 * 60_000, 20), checkout: limiter(15 * 60_000, 40), newsletter: limiter(60 * 60_000, 10) },
  };
}

export function createApp(deps: Deps) {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, _res, next) => ((req.config = config), next()));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url }) },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins, credentials: true, allowedHeaders: ['content-type', 'x-csrf-token'], maxAge: 600 }));
  app.use(cookieParser());
  app.use(rateLimitGlobal(config));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/health/db', async (_req, res) => {
    try {
      await db().execute(sql`select 1`);
      res.json({ ok: true });
    } catch (err) {
      // only the driver/SQLSTATE code (e.g. 28P01, CONNECT_TIMEOUT), never the message, so nothing sensitive leaks
      const e = err as { code?: string; cause?: { code?: string } };
      res.status(503).json({ ok: false, code: e.cause?.code ?? e.code ?? 'unknown' });
    }
  });

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/media', express.static(path.resolve(config.STORAGE_LOCAL_DIR), { immutable: true, maxAge: '365d', index: false, fallthrough: false }));
  }

  // webhooks need the raw body for signature verification → before express.json, and outside CSRF/session handling
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes(deps));

  app.use(express.json({ limit: '1mb' }));
  app.use(loadUser, csrfGuard);

  const v1 = express.Router();
  v1.use('/auth', authRoutes(deps));
  v1.use('/me', meRoutes(deps));
  v1.use('/admin', requireRole('content', 'manager', 'admin'), adminRouter(deps));
  v1.use('/', publicRoutes(deps));
  app.use('/api/v1', v1);

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Not found')));
  app.use(errorHandler(config));
  return app;
}

function adminRouter(deps: Deps) {
  const r = express.Router();
  r.use('/products', adminProductRoutes(deps));
  r.use('/', adminCommerceRoutes(deps));
  r.use('/', adminContentRoutes(deps));
  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  return r;
}

function rateLimitGlobal(config: Config): RequestHandler {
  if (config.rateLimitOff) return (_q, _s, n) => n();
  return rateLimit({ windowMs: 15 * 60_000, limit: 1200, standardHeaders: 'draft-7', legacyHeaders: false, skip: (req) => req.path.startsWith('/api/v1/webhooks') });
}

function errorHandler(config: Config): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      return void res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return void res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request', details: err.issues } });
    }
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON' } });
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') return void res.status(413).json({ error: { code: 'too_large', message: 'That upload is too large' } });
    // errors raised by middleware such as express.static (missing media → 404) carry their own 4xx status
    const status = Number(err?.status ?? err?.statusCode);
    if (status >= 400 && status < 500) return void res.status(status).json({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: status === 404 ? 'Not found' : 'Bad request' } });
    if (err?.code === 11000) return void res.status(409).json({ error: { code: 'duplicate', message: 'That value already exists' } });
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'internal', message: config.isProd ? 'Something went wrong' : String(err?.message ?? err) } });
  };
}
