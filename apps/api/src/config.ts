import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Postgres (Supabase): use the pooler in session mode (port 5432); see .env.example. */
  DATABASE_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:54329/cityroyalty'),
  DB_POOL_MAX: z.coerce.number().default(10),
  /** Queries postgres-js may pipeline per connection; 1 behind Supabase's transaction pooler. */
  DB_MAX_PIPELINE: z.coerce.number().default(100),
  /** Alternative to DATABASE_URL: parts, so only the password has to be a secret. Used when DB_PASSWORD is set and DATABASE_URL is not. */
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().optional(),
  DB_NAME: z.string().default('postgres'),
  DB_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:3001'),
  TRUST_PROXY: z.string().default('0'),
  STORAGE_DRIVER: z.enum(['local', 's3', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  PUBLIC_MEDIA_URL: z.string().default('/media'),
  /** supabase driver: the media-upload Edge Function URL and the token it accepts */
  SUPABASE_MEDIA_UPLOAD_URL: z.string().optional(),
  SUPABASE_MEDIA_TOKEN: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_MOCK_ENABLED: bool,
  /** Test/dev convenience (e2e suite). Ignored in production. */
  RATE_LIMIT_DISABLED: bool,
  MOCK_WEBHOOK_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('City Royalty <orders@cityroyalty.in>'),
  REVALIDATE_URL: z.string().optional(),
  REVALIDATE_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const input = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]));
  const raw = schema.parse(input);
  if (!input.DATABASE_URL && raw.DB_PASSWORD) {
    if (!raw.DB_HOST || !raw.DB_USER) throw new Error('DB_HOST and DB_USER are required with DB_PASSWORD');
    raw.DATABASE_URL = `postgres://${encodeURIComponent(raw.DB_USER)}:${encodeURIComponent(raw.DB_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME}`;
  }
  const prod = raw.NODE_ENV === 'production';
  if (prod && (!raw.JWT_SECRET || raw.JWT_SECRET.length < 32)) throw new Error('JWT_SECRET (32+ chars) is required in production');
  if (prod && raw.PAYMENT_MOCK_ENABLED) throw new Error('PAYMENT_MOCK_ENABLED must not be true in production');
  if (prod && raw.STORAGE_DRIVER === 'local') console.warn('[config] STORAGE_DRIVER=local in production: media will not survive redeploys');
  if (raw.STORAGE_DRIVER === 'supabase' && (!raw.SUPABASE_MEDIA_UPLOAD_URL || !raw.SUPABASE_MEDIA_TOKEN)) throw new Error('SUPABASE_MEDIA_UPLOAD_URL and SUPABASE_MEDIA_TOKEN are required for STORAGE_DRIVER=supabase');
  const jwtSecret = raw.JWT_SECRET ?? randomBytes(32).toString('hex');
  return {
    ...raw,
    isProd: prod,
    isTest: raw.NODE_ENV === 'test',
    rateLimitOff: raw.NODE_ENV === 'test' || (raw.RATE_LIMIT_DISABLED && !prod),
    jwtSecret,
    corsOrigins: raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: /^\d+$/.test(raw.TRUST_PROXY) ? Number(raw.TRUST_PROXY) : raw.TRUST_PROXY === 'true',
    providers: {
      razorpay: Boolean(raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET),
      stripe: Boolean(raw.STRIPE_SECRET_KEY && raw.STRIPE_PUBLISHABLE_KEY),
      mock: raw.PAYMENT_MOCK_ENABLED && !prod,
    },
  };
}
