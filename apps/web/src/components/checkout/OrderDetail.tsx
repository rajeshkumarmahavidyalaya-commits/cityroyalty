import type { OrderDTO } from '@cityroyalty/shared';
import { formatMoney } from '@/lib/format';

const LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment', payment_failed: 'Payment failed', paid: 'Paid', processing: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded',
};

export function OrderDetail({ order: o }: { order: OrderDTO }) {
  return (
    <section className="grid gap-10 md:grid-cols-[1fr_20rem]" aria-label={`Order ${o.number}`}>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-3xl">Order {o.number}</h2>
          <p className="eyebrow border border-royal px-3 py-1">{LABEL[o.status] ?? o.status}</p>
        </div>
        <p className="mt-2 text-sm text-muted">Placed {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {o.lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-4 py-4 text-sm">
              <div><p>{l.title}</p><p className="text-xs text-muted">{l.optionsLabel} × {l.qty}</p></div>
              <p className="tabular-nums">{formatMoney(l.lineTotal)}</p>
            </li>
          ))}
        </ul>
        {o.shipments.length > 0 && (
          <div className="mt-8"><h3 className="eyebrow mb-3">Shipment</h3>
            {o.shipments.map((s) => (
              <p key={s.id} className="text-sm">{s.carrier} · {s.trackingNumber}{s.trackingUrl && <> · <a className="underline underline-offset-4" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">Track</a></>}</p>
            ))}
          </div>
        )}
        <div className="mt-8"><h3 className="eyebrow mb-3">Progress</h3>
          <ol className="space-y-2 border-l border-stone pl-5 text-sm">
            {o.timeline.map((t, i) => (<li key={i}><b className="font-medium">{LABEL[t.status] ?? t.status}</b> <span className="text-muted">— {new Date(t.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>{t.note ? <span className="block text-xs text-muted">{t.note}</span> : null}</li>))}
          </ol>
        </div>
      </div>
      <aside className="h-fit bg-white p-6 text-sm">
        <dl className="space-y-1.5">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(o.subtotal)}</dd></div>
          {o.discountTotal > 0 && <div className="flex justify-between text-ok"><dt>Discount {o.discountCode}</dt><dd className="tabular-nums">−{formatMoney(o.discountTotal)}</dd></div>}
          <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{o.shippingTotal ? formatMoney(o.shippingTotal) : 'Free'}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-medium"><dt>Total</dt><dd className="tabular-nums">{formatMoney(o.total)}</dd></div>
        </dl>
        <h3 className="eyebrow mb-2 mt-6">Delivering to</h3>
        <address className="not-italic text-muted">{o.shippingAddress.fullName}<br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ''}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.pin}</address>
      </aside>
    </section>
  );
}
