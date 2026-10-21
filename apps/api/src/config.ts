import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/cityroyalty'),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:3001'),
  TRUST_PROXY: z.string().default('0'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  PUBLIC_MEDIA_URL: z.string().default('/media'),
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
  MOCK_WEBHOOK_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('City Royalty <orders@cityroyalty.in>'),
  REVALIDATE_URL: z.string().optional(),
  REVALIDATE_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = schema.parse(Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v])));
  const prod = raw.NODE_ENV === 'production';
  if (prod && (!raw.JWT_SECRET || raw.JWT_SECRET.length < 32)) throw new Error('JWT_SECRET (32+ chars) is required in production');
  if (prod && raw.PAYMENT_MOCK_ENABLED) throw new Error('PAYMENT_MOCK_ENABLED must not be true in production');
  if (prod && raw.STORAGE_DRIVER === 'local') console.warn('[config] STORAGE_DRIVER=local in production: media will not survive redeploys');
  const jwtSecret = raw.JWT_SECRET ?? randomBytes(32).toString('hex');
  return {
    ...raw,
    isProd: prod,
    isTest: raw.NODE_ENV === 'test',
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
