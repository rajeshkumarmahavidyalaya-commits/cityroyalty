import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Session, makeUser, sessionFor, startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(() => t.reset());

describe('auth', () => {
  it('signs up, sets httpOnly session + csrf cookies, and returns the user', async () => {
    const res = await request(t.app).post('/api/v1/auth/signup').send({ name: 'Asha', email: 'Asha@Example.com', password: 'Sup3rsecret!!' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('asha@example.com');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/cr_session=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/cr_csrf=/);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const bad = await request(t.app).post('/api/v1/auth/signup').send({ name: 'A', email: 'a@b.com', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    await makeUser('customer', 'dup@t.test');
    const dup = await request(t.app).post('/api/v1/auth/signup').send({ name: 'Dup', email: 'dup@t.test', password: 'Sup3rsecret!!' });
    expect(dup.status).toBe(409);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    await makeUser('customer', 'real@t.test');
    const a = await request(t.app).post('/api/v1/auth/login').send({ email: 'real@t.test', password: 'wrong-password1' });
    const b = await request(t.app).post('/api/v1/auth/login').send({ email: 'ghost@t.test', password: 'wrong-password1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    await makeUser('customer', 'lock@t.test');
    for (let i = 0; i < 8; i++) await request(t.app).post('/api/v1/auth/login').send({ email: 'lock@t.test', password: 'nope-nope-1234' });
    const res = await request(t.app).post('/api/v1/auth/login').send({ email: 'lock@t.test', password: 'Passw0rd-12345' });
    expect(res.status).toBe(429);
  });

  it('requires the CSRF header on state-changing requests from a session', async () => {
    const s = await sessionFor(t.app, 'customer');
    const noHeader = await request(t.app).patch('/api/v1/me/profile').set('Cookie', s.cookie).send({ name: 'New Name' });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('csrf');
    const ok = await s.patch('/api/v1/me/profile', { name: 'New Name' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.name).toBe('New Name');
  });

  it('password reset: token is single-use, old sessions die, email never reveals existence', async () => {
    const s = await sessionFor(t.app, 'customer', 'reset@t.test');
    const unknown = await request(t.app).post('/api/v1/auth/forgot').send({ email: 'nobody@t.test' });
    expect(unknown.status).toBe(200);
    expect(t.deps.mailer.outbox).toHaveLength(0);
    await request(t.app).post('/api/v1/auth/forgot').send({ email: 'reset@t.test' }).expect(200);
    const link = t.deps.mailer.outbox[0]!.text.match(/token=([^ ]+)/)![1]!;
    const token = decodeURIComponent(link);
    await request(t.app).post('/api/v1/auth/reset').send({ token, password: 'Brand-new-pass1' }).expect(200);
    await request(t.app).post('/api/v1/auth/reset').send({ token, password: 'Another-pass-22' }).expect(400);
    expect((await s.get('/api/v1/auth/me')).status).toBe(401); // old session invalidated
    await new Session(t.app).login('reset@t.test', 'Brand-new-pass1');
  });

  it('protects admin routes by role', async () => {
    expect((await request(t.app).get('/api/v1/admin/products')).status).toBe(401);
    const cust = await sessionFor(t.app, 'customer');
    expect((await cust.get('/api/v1/admin/products')).status).toBe(403);
    const content = await sessionFor(t.app, 'content');
    expect((await content.get('/api/v1/admin/products')).status).toBe(200);
    expect((await content.get('/api/v1/admin/orders')).status).toBe(403);
    expect((await content.get('/api/v1/admin/settings')).status).toBe(403);
    const mgr = await sessionFor(t.app, 'manager');
    expect((await mgr.get('/api/v1/admin/orders')).status).toBe(200);
    expect((await mgr.get('/api/v1/admin/settings')).status).toBe(403);
    const admin = await sessionFor(t.app, 'admin');
    expect((await admin.get('/api/v1/admin/settings')).status).toBe(200);
  });
});
