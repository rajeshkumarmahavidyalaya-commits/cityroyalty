'use client';
import { useState } from 'react';
import { call, fieldErrors } from '@/lib/client-api';

export function Newsletter({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await call('/newsletter', { body: { email, source: 'footer' } });
      setState('done');
    } catch (err) {
      setState('error');
      setMsg(fieldErrors(err).email ?? (err as Error).message);
    }
  }
  const dark = tone === 'dark';
  return (
    <form onSubmit={submit} className="mt-8 max-w-sm" noValidate>
      <label htmlFor="nl-email" className={`eyebrow mb-3 block ${dark ? 'text-stone' : 'text-muted'}`}>Join the list</label>
      {state === 'done' ? (
        <p role="status" className="text-sm">Thank you — you’re on the list.</p>
      ) : (
        <div className={`flex border-b ${dark ? 'border-ivory/60' : 'border-royal'}`}>
          <input
            id="nl-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            autoComplete="email"
            aria-invalid={state === 'error'}
            aria-describedby={state === 'error' ? 'nl-err' : undefined}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-stone/70"
          />
          <button type="submit" disabled={state === 'busy'} className="eyebrow px-2 disabled:opacity-50">{state === 'busy' ? '…' : 'Subscribe'}</button>
        </div>
      )}
      {state === 'error' && <p id="nl-err" role="alert" className="mt-2 text-xs text-[#ffb4a8]">{msg}</p>}
    </form>
  );
}
