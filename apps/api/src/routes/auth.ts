import { Router } from 'express';
import { and, eq, gt, sql } from 'drizzle-orm';
import { forgotSchema, loginSchema, resetSchema, signupSchema, STAFF_ROLES, type Role, type UserDTO } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { db } from '../db';
import { users, type UserRow } from '../db/schema';
import { clearSession, hashPassword, issueSession, loadUser, randomToken, requireAuth, sha256, verifyPassword } from '../lib/auth';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors';
import { escapeHtml, layout } from '../lib/mailer';
import { parse, wrap } from '../lib/http';

// bcrypt of a random string: lets us spend the same time on unknown emails (no user enumeration by timing)
const DUMMY_HASH = '$2b$11$Zk0uA3m0w7Bv3qLw5H3lWOk2m5y0m5nqkq0wXn3Qm0yVqKc8c6u1G';
const MAX_FAILS = 8;
const LOCK_MIN = 15;

export const toUserDTO = (u: Pick<UserRow, 'id' | 'name' | 'email' | 'phone' | 'role'>): UserDTO => ({ id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, role: u.role as Role });

export function authRoutes({ config, mailer, rate }: Deps) {
  const r = Router();

  r.post('/signup', rate.auth, wrap(async (req, res) => {
    const { name, email, password } = parse(signupSchema, req.body);
    const [exists] = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw conflict('An account with this email already exists', 'email_taken');
    const [user] = await db().insert(users).values({ name, email, passwordHash: await hashPassword(password) }).returning();
    issueSession(res, config, { id: user!.id, role: user!.role as Role, tokenVersion: user!.tokenVersion });
    res.status(201).json({ user: toUserDTO(user!) });
  }));

  r.post('/login', rate.auth, wrap(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const [user] = await db().select().from(users).where(eq(users.email, email));
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, 'locked', 'Too many attempts. Try again in a few minutes.');
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        const fails = user.failedLogins + 1;
        await db()
          .update(users)
          .set(fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } : { failedLogins: fails })
          .where(eq(users.id, user.id));
      }
      throw unauthorized('Incorrect email or password');
    }
    await db().update(users).set({ failedLogins: 0, lastLoginAt: new Date(), lockedUntil: null }).where(eq(users.id, user.id));
    issueSession(res, config, { id: user.id, role: user.role as Role, tokenVersion: user.tokenVersion });
    res.json({ user: toUserDTO(user), staff: STAFF_ROLES.includes(user.role as Role) });
  }));

  r.post('/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  r.get('/me', loadUser, requireAuth, wrap(async (req, res) => {
    const [u] = await db().select().from(users).where(eq(users.id, req.user!.id));
    if (!u) throw unauthorized();
    res.json({ user: toUserDTO(u) });
  }));

  r.post('/forgot', rate.auth, wrap(async (req, res) => {
    const { email } = parse(forgotSchema, req.body);
    const [user] = await db().select().from(users).where(eq(users.email, email));
    if (user) {
      const token = randomToken(32);
      await db().update(users).set({ resetTokenHash: sha256(token), resetExpires: new Date(Date.now() + 3600_000) }).where(eq(users.id, user.id));
      const link = `${config.PUBLIC_WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await mailer.send({
        to: user.email,
        subject: 'Reset your City Royalty password',
        text: `Reset your password: ${link} (valid for 1 hour)`,
        html: layout('Reset your password', `<p>Hello ${escapeHtml(user.name)}, use the button below to choose a new password. The link is valid for one hour. If you didn’t ask for this, you can ignore this email.</p>`, { label: 'Choose a new password', href: link }),
      });
    }
    res.json({ ok: true }); // same answer whether or not the account exists
  }));

  r.post('/reset', rate.auth, wrap(async (req, res) => {
    const { token, password } = parse(resetSchema, req.body);
    // single statement: the token is consumed by whoever gets here first
    const [user] = await db()
      .update(users)
      .set({ passwordHash: await hashPassword(password), failedLogins: 0, tokenVersion: sql`${users.tokenVersion} + 1`, resetTokenHash: null, resetExpires: null, lockedUntil: null })
      .where(and(eq(users.resetTokenHash, sha256(token)), gt(users.resetExpires, new Date())))
      .returning({ id: users.id });
    if (!user) throw badRequest('This reset link is invalid or has expired', undefined, 'invalid_token');
    clearSession(res);
    res.json({ ok: true });
  }));

  return r;
}
