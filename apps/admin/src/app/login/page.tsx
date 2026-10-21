'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, errorMessage } from '@/lib/api';
import { Notice } from '@/components/kit';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center bg-royal px-4">
      <form
        className="w-full max-w-sm space-y-4 bg-ivory p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr('');
          try {
            const r = await call<{ staff: boolean }>('/auth/login', { body: { email, password } });
            if (!r.staff) { await call('/auth/logout', { method: 'POST', body: {} }); throw new Error('This account does not have admin access.'); }
            router.replace('/');
          } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
        }}
      >
        <p className="font-serif text-2xl uppercase tracking-[0.2em]">City Royalty</p>
        <p className="text-sm text-muted">Admin sign in</p>
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></div>
        {err && <Notice tone="error">{err}</Notice>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
