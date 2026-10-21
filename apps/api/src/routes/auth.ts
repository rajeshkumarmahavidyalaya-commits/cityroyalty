import { Router } from 'express';
import { forgotSchema, loginSchema, resetSchema, signupSchema, STAFF_ROLES, type UserDTO } from '@cityroyalty/shared';
import type { Deps } from '../app';
import { clearSession, hashPassword, issueSession, loadUser, randomToken, requireAuth, sha256, verifyPassword } from '../lib/auth';
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors';
import { escapeHtml, layout } from '../lib/mailer';
import { parse, wrap } from '../lib/http';
import { User } from '../models';

// bcrypt of a random string: lets us spend the same time on unknown emails (no user enumeration by timing)
const DUMMY_HASH = '$2b$11$Zk0uA3m0w7Bv3qLw5H3lWOk2m5y0m5nqkq0wXn3Qm0yVqKc8c6u1G';
const MAX_FAILS = 8;
const LOCK_MIN = 15;

export const toUserDTO = (u: any): UserDTO => ({ id: String(u._id ?? u.id), name: u.name, email: u.email, phone: u.phone ?? undefined, role: u.role });

export function authRoutes({ config, mailer, rate }: Deps) {
  const r = Router();

  r.post('/signup', rate.auth, wrap(async (req, res) => {
    const { name, email, password } = parse(signupSchema, req.body);
    if (await User.exists({ email })) throw conflict('An account with this email already exists', 'email_taken');
    const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    issueSession(res, config, { id: String(user._id), role: user.role as any, tokenVersion: user.tokenVersion });
    res.status(201).json({ user: toUserDTO(user) });
  }));

  r.post('/login', rate.auth, wrap(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, 'locked', 'Too many attempts. Try again in a few minutes.');
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        const fails = user.failedLogins + 1;
        await User.updateOne({ _id: user._id }, { $set: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } : { failedLogins: fails } });
      }
      throw unauthorized('Incorrect email or password');
    }
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: '' } });
    issueSession(res, config, { id: String(user._id), role: user.role as any, tokenVersion: user.tokenVersion });
    res.json({ user: toUserDTO(user), staff: STAFF_ROLES.includes(user.role as any) });
  }));

  r.post('/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  r.get('/me', loadUser, requireAuth, wrap(async (req, res) => {
    const u = await User.findById(req.user!.id).lean();
    if (!u) throw unauthorized();
    res.json({ user: toUserDTO(u) });
  }));

  r.post('/forgot', rate.auth, wrap(async (req, res) => {
    const { email } = parse(forgotSchema, req.body);
    const user = await User.findOne({ email });
    if (user) {
      const token = randomToken(32);
      await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: sha256(token), resetExpires: new Date(Date.now() + 3600_000) } });
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
    const user = await User.findOne({ resetTokenHash: sha256(token), resetExpires: { $gt: new Date() } }).select('+resetTokenHash +resetExpires');
    if (!user) throw badRequest('This reset link is invalid or has expired', undefined, 'invalid_token');
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(password), failedLogins: 0 }, $inc: { tokenVersion: 1 }, $unset: { resetTokenHash: '', resetExpires: '', lockedUntil: '' } },
    );
    clearSession(res);
    res.json({ ok: true });
  }));

  return r;
}
