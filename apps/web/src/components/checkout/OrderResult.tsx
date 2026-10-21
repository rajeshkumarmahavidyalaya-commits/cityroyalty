'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import type { CheckoutResultDTO, OrderDTO } from '@cityroyalty/shared';
import { ApiError, call } from '@/lib/client-api';
import { useCart } from '@/lib/store';
import { OrderDetail } from './OrderDetail';
import { PaymentSession } from './PaymentSession';

function Inner({ kind }: { kind: 'success' | 'failed' }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { clear } = useCart();
  const number = sp.get('order') ?? '';
  const token = sp.get('token') ?? '';
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [err, setErr] = useState('');
  const [retry, setRetry] = useState<CheckoutResultDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!number || !token) return setErr('We need the order link from your email to show this page.');
    call<OrderDTO>(`/orders/by-token?order=${encodeURIComponent(number)}&token=${encodeURIComponent(token)}`)
      .then((o) => {
        setOrder(o);
        if (kind === 'success' && (o.status === 'paid' || o.status === 'processing')) clear();
      })
      .catch((e) => setErr(e instanceof ApiError ? 'We couldn’t find that order.' : 'Please try again in a moment.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, token, kind]);

  const onPaid = useCallback((o: OrderDTO) => { clear(); router.replace(`/checkout/success?order=${o.number}&token=${encodeURIComponent(token)}`); }, [clear, router, token]);
  const onFailed = useCallback(() => setRetry(null), []);

  async function retryPay() {
    setBusy(true); setErr('');
    try { setRetry(await call<CheckoutResultDTO>('/checkout/retry', { body: { orderNumber: number, accessToken: token } })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'We couldn’t restart the payment.'); }
    finally { setBusy(false); }
  }

  if (err && !order) return <div className="container-x py-24 text-center"><p role="alert">{err}</p><Link className="btn btn-ghost mt-6" href="/">Home</Link></div>;
  if (!order) return <div className="container-x py-24"><div className="skeleton h-40 max-w-xl" aria-busy /></div>;

  const paid = order.status === 'paid' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered';
  return (
    <div className="container-x py-12 md:py-20">
      {kind === 'success' && paid ? (
        <header className="mb-14 max-w-2xl">
          <p className="eyebrow text-ok">Thank you</p>
          <h1 className="mt-3 text-5xl md:text-7xl">Your order is confirmed</h1>
          <p className="mt-4 text-muted">A confirmation has been sent to {order.email}. You can follow your order any time with your order number.</p>
        </header>
      ) : paid ? (
        <header className="mb-14 max-w-2xl"><h1 className="text-5xl md:text-7xl">This order is already paid</h1><p className="mt-3 text-muted">Nothing more to do — we’re preparing it.</p></header>
      ) : (
        <header className="mb-14 max-w-2xl">
          <p className="eyebrow text-danger">Payment not completed</p>
          <h1 className="mt-3 text-5xl md:text-7xl">Let’s finish your order</h1>
          <p className="mt-4 text-muted">No money was taken for order {order.number}. {order.status === 'payment_failed' ? 'Your items are no longer held, so we will check they are still available.' : 'Your items are still held for a short while.'}</p>
          {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
          {retry ? (
            <div className="mt-8 max-w-xl"><PaymentSession result={retry} onPaid={onPaid} onFailed={onFailed} /></div>
          ) : (
            <div className="mt-8 flex gap-3"><button className="btn btn-primary" onClick={retryPay} disabled={busy}>{busy ? 'Preparing…' : 'Try payment again'}</button><Link className="btn btn-ghost" href="/collections/all">Keep shopping</Link></div>
          )}
        </header>
      )}
      <OrderDetail order={order} />
    </div>
  );
}

export function OrderResult({ kind }: { kind: 'success' | 'failed' }) {
  return <Suspense fallback={<div className="container-x py-24"><div className="skeleton h-40 max-w-xl" /></div>}><Inner kind={kind} /></Suspense>;
}
