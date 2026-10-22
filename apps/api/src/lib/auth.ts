import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@cityroyalty/shared';
import type { Config } from '../config';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { forbidden, unauthorized, HttpError } from './errors';

export const SESSION_COOKIE = 'cr_session';
export const CSRF_COOKIE = 'cr_csrf';
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  role: Role;
  email: string;
  name: string;
}
declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
    config: Config;
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function issueSession(res: Response, config: Config, user: { id: string; role: Role; tokenVersion: number }) {
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, config.jwtSecret, { expiresIn: `${SESSION_DAYS}d`, algorithm: 'HS256' });
  const base = { secure: config.isProd, sameSite: 'lax' as const, path: '/', maxAge: SESSION_DAYS * 86400_000 };
  res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
  res.cookie(CSRF_COOKIE, randomToken(24), { ...base, httpOnly: false });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** Resolves req.user from the session cookie (does not reject anonymous requests). */
export const loadUser: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const payload = jwt.verify(token, req.config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string; tv: number };
    const [user] = await db()
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (user && user.tokenVersion === payload.tv) {
      req.user = { id: user.id, role: user.role as Role, email: user.email, name: user.name };
    }
  } catch {
    /* invalid or expired token → treated as anonymous */
  }
  next();
};

/**
 * Double-submit CSRF check. Only enforced for browser sessions (cookie present) on unsafe methods;
 * webhooks and pure-bearer calls are mounted outside this middleware.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.cookies?.[SESSION_COOKIE]) return next(); // anonymous guests have nothing to forge
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) return next(new HttpError(403, 'csrf', 'Security check failed. Refresh the page and try again.'));
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => (req.user ? next() : next(unauthorized()));

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
