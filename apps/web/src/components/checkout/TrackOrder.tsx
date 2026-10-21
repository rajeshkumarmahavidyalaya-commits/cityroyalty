'use client';
import { useState } from 'react';
import type { OrderDTO } from '@cityroyalty/shared';
import { ApiError, call } from '@/lib/client-api';
import { OrderDetail } from './OrderDetail';

export function TrackOrder() {
  const [number, setNumber] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('order') ?? ''));
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="container-x py-12 md:py-20">
      <h1 className="text-5xl md:text-7xl">Track your order</h1>
      <p className="mt-3 max-w-lg text-muted">Enter the order number from your confirmation email and the email address you used at checkout.</p>
      <form
        className="mt-10 grid max-w-xl gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr(''); setOrder(null);
          try {
            setOrder(await call<OrderDTO>('/orders/track', { body: { orderNumber: number.trim(), email: email.trim() } }));
          } catch (x) {
            setErr(x instanceof ApiError && x.status === 404 ? 'We couldn’t find an order with those details. Please check and try again.' : (x as Error).message);
          } finally { setBusy(false); }
        }}
      >
        <div><label htmlFor="on" className="label">Order number</label><input id="on" className="field uppercase" placeholder="CR-100001" value={number} onChange={(e) => setNumber(e.target.value)} required /></div>
        <div><label htmlFor="oe" className="label">Email</label><input id="oe" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Track order'}</button>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </form>
      {order && <div className="mt-14"><OrderDetail order={order} /></div>}
    </div>
  );
}
