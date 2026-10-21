'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutResultDTO, OrderDTO } from '@cityroyalty/shared';
import { call, ApiError } from '@/lib/client-api';
import { formatMoney } from '@/lib/format';

declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
    Stripe?: (key: string) => any;
  }
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment form. Check your connection and try again.'));
    document.head.appendChild(s);
  });

interface Props {
  result: CheckoutResultDTO;
  onPaid: (order: OrderDTO) => void;
  onFailed: (reason?: string) => void;
}

/** Hosted / tokenised payment UI. Card details never touch our servers: Razorpay & Stripe collect them in their own frames. */
export function PaymentSession({ result, onPaid, onFailed }: Props) {
  const { payment, order } = result;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const opened = useRef(false);

  const verify = useCallback(
    async (payload: Record<string, string>) => {
      setBusy(true);
      try {
        const r = await call<{ status: 'paid' | 'failed' | 'pending'; order?: OrderDTO }>('/checkout/verify', {
          body: { orderNumber: order.number, accessToken: order.accessToken, provider: payment.provider, payload },
        });
        if (r.status === 'paid' && r.order) onPaid(r.order);
        else if (r.status === 'failed') onFailed('The payment was declined.');
        else setMsg('Your payment is still processing. We’ll email you as soon as it is confirmed.');
      } catch (e) {
        setMsg(e instanceof ApiError ? e.message : 'We could not confirm the payment. If you were charged, we will confirm your order by email.');
      } finally {
        setBusy(false);
      }
    },
    [order.number, order.accessToken, payment.provider, onPaid, onFailed],
  );

  const openRazorpay = useCallback(async () => {
    if (payment.provider !== 'razorpay') return;
    try {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const rz = new window.Razorpay!({
        key: payment.keyId,
        order_id: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        name: payment.name,
        prefill: payment.prefill,
        theme: { color: '#080808' },
        handler: (r: Record<string, string>) => void verify({ razorpay_payment_id: r.razorpay_payment_id!, razorpay_order_id: r.razorpay_order_id!, razorpay_signature: r.razorpay_signature! }),
        modal: { ondismiss: () => setMsg('Payment window closed. You can try again when you’re ready.') },
      });
      rz.on('payment.failed', (r: { error?: { description?: string } }) => onFailed(r.error?.description));
      rz.open();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [payment, verify, onFailed]);

  useEffect(() => {
    if (payment.provider === 'razorpay' && !opened.current) {
      opened.current = true;
      void openRazorpay();
    }
    if (payment.provider === 'cod') {
      // order is already placed; nothing to collect now
      void call<OrderDTO>(`/orders/by-token?order=${encodeURIComponent(order.number)}&token=${encodeURIComponent(order.accessToken)}`).then(onPaid).catch(() => onFailed());
    }
  }, [payment.provider, openRazorpay, order.number, order.accessToken, onPaid, onFailed]);

  if (payment.provider === 'razorpay') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted">A secure Razorpay window should have opened.</p>
        <button type="button" className="btn btn-primary w-full" onClick={() => void openRazorpay()} disabled={busy}>Pay {formatMoney(payment.amount)}</button>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </div>
    );
  }
  if (payment.provider === 'stripe') return <StripeForm clientSecret={payment.clientSecret} publishableKey={payment.publishableKey} amount={order.total} verify={verify} onFailed={onFailed} />;
  if (payment.provider === 'mock') {
    return (
      <div className="space-y-3 border border-dashed border-tan bg-white p-5">
        <p className="eyebrow text-tan">Test payment (development only)</p>
        <p className="text-sm text-muted">No real payment is taken. Choose an outcome to simulate the provider response.</p>
        <div className="flex gap-3">
          <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => void verify({ result: 'success' })}>Simulate success</button>
          <button type="button" className="btn btn-ghost flex-1" disabled={busy} onClick={() => void verify({ result: 'fail' })}>Simulate failure</button>
        </div>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </div>
    );
  }
  return <p role="status" className="text-sm">Confirming your order…</p>;
}

function StripeForm({ clientSecret, publishableKey, amount, verify, onFailed }: { clientSecret: string; publishableKey: string; amount: number; verify: (p: Record<string, string>) => Promise<void>; onFailed: (r?: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const stripe = useRef<any>(null);
  const elements = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    loadScript('https://js.stripe.com/v3/')
      .then(() => {
        if (off || !host.current) return;
        stripe.current = window.Stripe!(publishableKey);
        elements.current = stripe.current.elements({ clientSecret, appearance: { theme: 'flat', variables: { colorPrimary: '#080808', borderRadius: '0px' } } });
        elements.current.create('payment').mount(host.current);
        setReady(true);
      })
      .catch((e) => setMsg(e.message));
    return () => {
      off = true;
    };
  }, [clientSecret, publishableKey]);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await stripe.current.confirmPayment({ elements: elements.current, redirect: 'if_required', confirmParams: { return_url: `${location.origin}/checkout/success` } });
        if (r.error) {
          setMsg(r.error.message ?? 'Payment failed');
          if (r.error.type === 'card_error') onFailed(r.error.message);
        } else await verify({});
        setBusy(false);
      }}
    >
      <div ref={host} />
      <button className="btn btn-primary w-full" disabled={!ready || busy}>{busy ? 'Processing…' : `Pay ${formatMoney(amount)}`}</button>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
    </form>
  );
}
