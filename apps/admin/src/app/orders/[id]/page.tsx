'use client';
import { use, useState } from 'react';
import type { OrderDTO } from '@cityroyalty/shared';
import { Badge, Loading, Notice, PageHeader } from '@/components/kit';
import { call, date, errorMessage, money, useResource } from '@/lib/api';

type Detail = OrderDTO & { flags: string[]; refundedTotal: number; notes?: string; payments: { id: string; provider: string; status: string; amount: number; providerPaymentId?: string }[] };
const NEXT: Record<string, string[]> = { paid: ['processing', 'cancelled'], processing: ['cancelled'], shipped: ['delivered'], pending_payment: ['cancelled'], payment_failed: ['cancelled'] };

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: o, loading, reload, error } = useResource<Detail>(`/admin/orders/${id}`);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [ship, setShip] = useState({ carrier: '', trackingNumber: '', trackingUrl: '' });
  const [refund, setRefund] = useState({ amount: '', reason: '' });
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ t: 'ok', s: ok }); await reload(); } catch (e) { setMsg({ t: 'error', s: errorMessage(e) }); } };
  if (loading && !o) return <Loading />;
  if (error || !o) return <Notice tone="error">{error?.message ?? 'Not found'}</Notice>;
  const canShip = ['paid', 'processing', 'shipped'].includes(o.status);
  const canRefund = ['paid', 'partially_refunded'].includes(o.paymentStatus) && o.refundedTotal < o.total;
  return (
    <div className="space-y-6">
      <PageHeader title={`Order ${o.number}`} sub={<><Badge value={o.status} /> <span className="ml-2">Placed {date(o.createdAt)} · {o.email}</span></>} />
      {o.flags.length > 0 && <Notice tone="error">Needs attention: {o.flags.map((f) => ({ amount_mismatch: 'the paid amount did not match the order total', stock_conflict: 'payment arrived after the stock hold expired and stock ran out — refund or backorder' } as Record<string, string>)[f] ?? f).join('; ')}.</Notice>}
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card"><h2 className="mb-3 text-xl">Items</h2>
            <ul className="divide-y divide-line">{o.lines.map((l, i) => (<li key={i} className="flex justify-between gap-4 py-3 text-sm"><div><p>{l.title}</p><p className="text-xs text-muted">{l.sku} · {l.optionsLabel} × {l.qty}</p></div><p>{money(l.lineTotal)}</p></li>))}</ul>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>{o.discountTotal > 0 && <div className="flex justify-between"><dt>Discount {o.discountCode}</dt><dd>−{money(o.discountTotal)}</dd></div>}<div className="flex justify-between"><dt>Shipping</dt><dd>{money(o.shippingTotal)}</dd></div><div className="flex justify-between text-base font-medium"><dt>Total</dt><dd>{money(o.total)}</dd></div>{o.refundedTotal > 0 && <div className="flex justify-between text-danger"><dt>Refunded</dt><dd>{money(o.refundedTotal)}</dd></div>}</dl>
          </section>
          <section className="card"><h2 className="mb-3 text-xl">Timeline</h2><ol className="space-y-2 border-l border-stone pl-4 text-sm">{o.timeline.map((t, i) => (<li key={i}><b className="font-medium">{t.status.replace('_', ' ')}</b> <span className="text-xs text-muted">{date(t.at)}</span>{t.note && <p className="text-xs text-muted">{t.note}</p>}</li>))}</ol></section>
        </div>
        <div className="space-y-6">
          <section className="card text-sm"><h2 className="mb-2 text-xl">Delivery</h2><address className="not-italic">{o.shippingAddress.fullName}<br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ''}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.pin}<br />{o.shippingAddress.phone}</address>{o.notes && <p className="mt-2 text-muted">Note: {o.notes}</p>}</section>
          <section className="card text-sm"><h2 className="mb-2 text-xl">Payment</h2>{o.payments.map((p) => <p key={p.id}>{p.provider} · {p.status.replace('_', ' ')} · {money(p.amount)}{p.providerPaymentId && <span className="block break-all text-xs text-muted">{p.providerPaymentId}</span>}</p>)}
            {canRefund && (
              <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); void act(() => call(`/admin/orders/${o.id}/refund`, { body: { amount: Math.round(Number(refund.amount) * 100), reason: refund.reason } }), 'Refund issued.'); }}>
                <label className="label" htmlFor="ra">Refund amount (₹) — up to {money(o.total - o.refundedTotal)}</label><input id="ra" className="field" inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} required />
                <label className="label" htmlFor="rr">Reason</label><input id="rr" className="field" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} required minLength={2} />
                <button className="btn btn-danger w-full" onClick={(e) => { if (!confirm('Refund through the payment provider? This cannot be undone.')) e.preventDefault(); }}>Issue refund</button>
              </form>
            )}
          </section>
          <section className="card text-sm"><h2 className="mb-2 text-xl">Fulfilment</h2>
            {o.shipments.map((s) => <p key={s.id} className="mb-2">{s.carrier} · {s.trackingNumber} · {s.status.replace('_', ' ')}</p>)}
            {canShip && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act(() => call(`/admin/orders/${o.id}/shipments`, { body: { carrier: ship.carrier, trackingNumber: ship.trackingNumber, ...(ship.trackingUrl ? { trackingUrl: ship.trackingUrl } : {}) } }), 'Shipment added; customer notified.'); }}>
                <label className="label" htmlFor="c">Carrier</label><input id="c" className="field" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} required />
                <label className="label" htmlFor="tn">Tracking number</label><input id="tn" className="field" value={ship.trackingNumber} onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })} required />
                <label className="label" htmlFor="tu">Tracking URL (optional)</label><input id="tu" type="url" className="field" value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} />
                <button className="btn btn-primary w-full">Mark as shipped</button>
              </form>
            )}
            <div className="mt-3 flex flex-wrap gap-2">{(NEXT[o.status] ?? []).map((s) => (<button key={s} className={`btn btn-sm ${s === 'cancelled' ? 'btn-danger' : 'btn-ghost'}`} onClick={() => { if (s !== 'cancelled' || confirm('Cancel this order and release its stock?')) void act(() => call(`/admin/orders/${o.id}/status`, { body: { status: s } }), `Order ${s}.`); }}>{s === 'cancelled' ? 'Cancel order' : `Mark ${s}`}</button>))}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
