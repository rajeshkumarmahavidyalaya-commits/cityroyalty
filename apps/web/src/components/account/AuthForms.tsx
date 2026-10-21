'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ApiError, call, fieldErrors } from '@/lib/client-api';
import { useAuth } from '@/lib/store';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
const TITLES: Record<Mode, string> = { login: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' };

function Inner({ mode }: { mode: Mode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { login, signup } = useAuth();
  const [v, setV] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const next = sp.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  const token = sp.get('token') ?? '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr({}); setMsg('');
    try {
      if (mode === 'login') { const u = await login(v.email, v.password); router.push(['content', 'manager', 'admin'].includes(u.role) && safeNext === '/account' ? '/account' : safeNext); }
      else if (mode === 'signup') { await signup(v.name, v.email, v.password); router.push(safeNext); }
      else if (mode === 'forgot') { await call('/auth/forgot', { body: { email: v.email } }); setMsg('If an account exists for that email, a reset link is on its way. It is valid for one hour.'); }
      else { await call('/auth/reset', { body: { token, password: v.password } }); setMsg('Your password has been changed. You can sign in now.'); setTimeout(() => router.push('/login'), 1500); }
    } catch (x) {
      const f = fieldErrors(x);
      setErr(Object.keys(f).length ? f : { form: x instanceof ApiError ? x.message : 'Something went wrong' });
    } finally { setBusy(false); }
  }
  const input = (id: 'name' | 'email' | 'password', label: string, type: string, ac: string) => (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type={type} className="field" autoComplete={ac} value={v[id]} onChange={(e) => setV({ ...v, [id]: e.target.value })} required aria-invalid={!!err[id]} aria-describedby={err[id] ? `${id}-e` : undefined} />
      {err[id] && <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-danger">{err[id]}</p>}
      {id === 'password' && (mode === 'signup' || mode === 'reset') && <p className="mt-1 text-xs text-muted">At least 10 characters, with letters and numbers.</p>}
    </div>
  );
  return (
    <div className="container-x grid min-h-[70vh] place-items-center py-14">
      <div className="w-full max-w-md">
        <h1 className="text-4xl md:text-5xl">{TITLES[mode]}</h1>
        <form onSubmit={submit} noValidate className="mt-8 space-y-5">
          {mode === 'signup' && input('name', 'Full name', 'text', 'name')}
          {mode !== 'reset' && input('email', 'Email', 'email', 'email')}
          {mode !== 'forgot' && input('password', mode === 'reset' ? 'New password' : 'Password', 'password', mode === 'login' ? 'current-password' : 'new-password')}
          {err.form && <p role="alert" className="text-sm text-danger">{err.form}</p>}
          {msg && <p role="status" className="text-sm text-ok">{msg}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : TITLES[mode]}</button>
        </form>
        <div className="mt-6 space-y-2 text-sm">
          {mode === 'login' && (<><p><Link className="underline underline-offset-4" href="/forgot-password">Forgot your password?</Link></p><p>New here? <Link className="underline underline-offset-4" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p></>)}
          {mode === 'signup' && <p>Already have an account? <Link className="underline underline-offset-4" href="/login">Sign in</Link></p>}
          {(mode === 'forgot' || mode === 'reset') && <p><Link className="underline underline-offset-4" href="/login">Back to sign in</Link></p>}
        </div>
      </div>
    </div>
  );
}
export const AuthForm = ({ mode }: { mode: Mode }) => <Suspense><Inner mode={mode} /></Suspense>;
