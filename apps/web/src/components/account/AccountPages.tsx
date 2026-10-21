'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { addressSchema, type AddressDTO, type OrderDTO, type ProductCardDTO } from '@cityroyalty/shared';
import { ApiError, call } from '@/lib/client-api';
import { INDIAN_STATES, formatMoney } from '@/lib/format';
import { useAuth, useWishlist } from '@/lib/store';
import { OrderDetail } from '../checkout/OrderDetail';
import { ProductCard } from '../product/ProductCard';

export function Overview() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  useEffect(() => { call<{ items: OrderDTO[] }>('/me/orders').then((r) => setOrders(r.items)).catch(() => setOrders([])); }, []);
  return (
    <div className="space-y-10">
      <p className="text-lg">Welcome back, {user?.name.split(' ')[0]}.</p>
      <section aria-labelledby="ro"><h2 id="ro" className="mb-4 text-2xl">Recent orders</h2>
        {orders === null ? <div className="skeleton h-16" /> : orders.length === 0 ? <p className="text-muted">No orders yet. <Link className="underline underline-offset-4" href="/collections/all">Start shopping</Link></p> : <OrderList orders={orders.slice(0, 3)} />}
      </section>
    </div>
  );
}

function OrderList({ orders }: { orders: OrderDTO[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {orders.map((o) => (
        <li key={o.id}><Link href={`/account/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-white/60">
          <span><b className="font-medium">{o.number}</b> <span className="text-sm text-muted">· {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
          <span className="eyebrow">{o.status.replace('_', ' ')}</span>
          <span className="tabular-nums">{formatMoney(o.total)}</span>
        </Link></li>
      ))}
    </ul>
  );
}

export function OrdersList() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  useEffect(() => { call<{ items: OrderDTO[] }>('/me/orders').then((r) => setOrders(r.items)).catch(() => setOrders([])); }, []);
  if (orders === null) return <div className="skeleton h-32" />;
  return orders.length ? <OrderList orders={orders} /> : <p className="text-muted">You haven’t placed an order yet.</p>;
}

export function OrderView({ number }: { number: string }) {
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { call<OrderDTO>(`/me/orders/${number}`).then(setOrder).catch(() => setErr('Order not found.')); }, [number]);
  if (err) return <p role="alert">{err}</p>;
  if (!order) return <div className="skeleton h-40" />;
  const canReturn = ['shipped', 'delivered'].includes(order.status);
  return (
    <div>
      <OrderDetail order={order} />
      {canReturn && (
        <div className="mt-12 border-t border-line pt-8">
          <h3 className="text-2xl">Need to return something?</h3>
          {done ? <p role="status" className="mt-3 text-ok">{done}</p> : (
            <ReturnForm order={order} onDone={() => setDone('Your return request has been received. We’ll email you with next steps.')} open={open} setOpen={setOpen} reason={reason} setReason={setReason} />
          )}
        </div>
      )}
    </div>
  );
}

function ReturnForm({ order, onDone, open, setOpen, reason, setReason }: { order: OrderDTO; onDone: () => void; open: boolean; setOpen: (v: boolean) => void; reason: string; setReason: (v: string) => void }) {
  const [lines, setLines] = useState<Record<number, boolean>>({});
  const [err, setErr] = useState('');
  if (!open) return <button type="button" className="btn btn-ghost mt-4" onClick={() => setOpen(true)}>Request a return</button>;
  return (
    <form className="mt-4 max-w-lg space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setErr('');
      const sel = order.lines.filter((_, i) => lines[i]);
      if (!sel.length) return setErr('Select at least one item.');
      try {
        await call(`/me/orders/${order.number}/return`, { body: { lines: sel.map((l) => ({ variantId: l.variantId, qty: l.qty })), reason } });
        onDone();
      } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not submit the request.'); }
    }}>
      <p className="text-sm text-muted">Select the items and tell us what happened. Our team will review your request in line with the returns policy.</p>
      <fieldset><legend className="label">Items</legend>
        {order.lines.map((l, i) => (<label key={i} className="flex items-center gap-3 py-1 text-sm"><input type="checkbox" className="accent-royal" checked={!!lines[i]} onChange={(e) => setLines({ ...lines, [i]: e.target.checked })} />{l.title} {l.optionsLabel && <span className="text-muted">({l.optionsLabel})</span>}</label>))}
      </fieldset>
      <div><label htmlFor="rr" className="label">Reason</label><textarea id="rr" className="field" rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn btn-primary">Submit request</button>
    </form>
  );
}

const blank = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pin: '', isDefault: false };
export function Addresses() {
  const [items, setItems] = useState<AddressDTO[] | null>(null);
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const load = useCallback(() => call<{ items: AddressDTO[] }>('/me/addresses').then((r) => setItems(r.items)), []);
  useEffect(() => { void load(); }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = addressSchema.safeParse(edit);
    if (!p.success) return setErr(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
    const body = { ...p.data, isDefault: !!edit!.isDefault };
    const r = edit!.id ? await call<{ items: AddressDTO[] }>(`/me/addresses/${edit!.id}`, { method: 'PUT', body }) : await call<{ items: AddressDTO[] }>('/me/addresses', { body });
    setItems(r.items); setEdit(null); setErr({});
  }
  if (!items) return <div className="skeleton h-32" />;
  return (
    <div>
      {!edit && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((a) => (
              <li key={a.id} className="bg-white p-5 text-sm">
                {a.isDefault && <p className="eyebrow mb-2 text-tan">Default</p>}
                <address className="not-italic leading-relaxed">{a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pin}<br />{a.phone}</address>
                <div className="mt-4 flex gap-4"><button className="underline underline-offset-4" onClick={() => setEdit({ ...a })}>Edit</button><button className="underline underline-offset-4" onClick={async () => setItems((await call<{ items: AddressDTO[] }>(`/me/addresses/${a.id}`, { method: 'DELETE' })).items)}>Delete</button></div>
              </li>
            ))}
          </ul>
          {items.length === 0 && <p className="text-muted">No saved addresses yet.</p>}
          <button className="btn btn-ghost mt-6" onClick={() => setEdit({ ...blank })}>Add an address</button>
        </>
      )}
      {edit && (
        <form onSubmit={save} noValidate className="grid max-w-xl gap-4 sm:grid-cols-2">
          {(['fullName', 'phone', 'line1', 'line2', 'city', 'pin'] as const).map((k) => (
            <div key={k} className={k === 'fullName' || k === 'line1' || k === 'line2' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`a-${k}`} className="label">{{ fullName: 'Full name', phone: 'Mobile number', line1: 'Address', line2: 'Apartment, landmark', city: 'City', pin: 'PIN code' }[k]}</label>
              <input id={`a-${k}`} className="field" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} aria-invalid={!!err[k]} />
              {err[k] && <p role="alert" className="mt-1 text-xs text-danger">{err[k]}</p>}
            </div>
          ))}
          <div><label htmlFor="a-state" className="label">State</label><select id="a-state" className="field" value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })}><option value="">Select</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>{err.state && <p role="alert" className="mt-1 text-xs text-danger">{err.state}</p>}</div>
          <label className="flex items-center gap-3 self-end pb-3 text-sm"><input type="checkbox" className="accent-royal" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />Make default</label>
          <div className="flex gap-3 sm:col-span-2"><button className="btn btn-primary">Save address</button><button type="button" className="btn btn-ghost" onClick={() => { setEdit(null); setErr({}); }}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function WishlistPage() {
  const { ids } = useWishlist();
  const { user } = useAuth();
  const [items, setItems] = useState<ProductCardDTO[] | null>(null);
  useEffect(() => {
    if (!user) return;
    call<{ items: ProductCardDTO[] }>('/me/wishlist').then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [user, ids.length]);
  if (!items) return <div className="skeleton h-40" />;
  const shown = items.filter((p) => ids.includes(p.id));
  return shown.length ? (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3">{shown.map((p) => <li key={p.id}><ProductCard product={p} quickView={false} /></li>)}</ul>
  ) : (<p className="text-muted">Tap the heart on any piece to save it here. <Link className="underline underline-offset-4" href="/collections/all">Browse the collection</Link></p>);
}

export function Profile() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="max-w-lg space-y-12">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setMsg(''); setErr('');
        try { await call('/me/profile', { method: 'PATCH', body: { name, ...(phone ? { phone } : {}) } }); await refresh(); setMsg('Profile updated.'); }
        catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not save'); }
      }}>
        <div><label className="label" htmlFor="pn">Name</label><input id="pn" className="field" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label" htmlFor="pe">Email</label><input id="pe" className="field bg-line/50" value={user?.email} readOnly aria-readonly /></div>
        <div><label className="label" htmlFor="pp">Mobile</label><input id="pp" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></div>
        <button className="btn btn-primary">Save changes</button>
        {msg && <p role="status" className="text-sm text-ok">{msg}</p>}{err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </form>
      <section aria-labelledby="priv" className="border-t border-line pt-8">
        <h2 id="priv" className="text-2xl">Privacy</h2>
        <p className="mt-2 text-sm text-muted">You can ask us to delete your account and personal data. Order records may be kept where the law requires it.</p>
        {confirm ? (
          <div className="mt-4 space-x-3"><button className="btn btn-primary" onClick={async () => { await call('/me/delete-request', { body: {} }); await logout(); router.push('/'); }}>Yes, request deletion</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
        ) : <button className="btn btn-ghost mt-4" onClick={() => setConfirm(true)}>Request account deletion</button>}
      </section>
    </div>
  );
}
