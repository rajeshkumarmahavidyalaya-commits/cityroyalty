'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addressSchema, type AddressDTO, type CheckoutResultDTO, type OrderDTO, type PaymentProvider, type PublicSettingsDTO } from '@cityroyalty/shared';
import { ApiError, call, fieldErrors } from '@/lib/client-api';
import { INDIAN_STATES, formatMoney } from '@/lib/format';
import { useAuth, useCart } from '@/lib/store';
import { DiscountField, Totals } from '../layout/CartDrawer';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { PaymentSession } from './PaymentSession';

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  razorpay: 'UPI, cards, netbanking & wallets (Razorpay)',
  stripe: 'Credit / debit card (Stripe)',
  cod: 'Cash on delivery',
  mock: 'Test payment (development)',
};

const blank = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pin: '' };

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function CheckoutView({ settings }: { settings: PublicSettingsDTO | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const cart = useCart();
  const { priced, lines, clear } = cart;
  const providers = (settings?.paymentProviders ?? []) as PaymentProvider[];
  const [email, setEmail] = useState('');
  const [addr, setAddr] = useState(blank);
  const [provider, setProvider] = useState<PaymentProvider | ''>('');
  const [subscribe, setSubscribe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<CheckoutResultDTO | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => { if (!provider && providers.length) setProvider(providers[0]!); }, [providers, provider]);
  // prefill from the account
  useEffect(() => {
    if (!user) return;
    setEmail((e) => e || user.email);
    call<{ items: AddressDTO[] }>('/me/addresses').then((r) => {
      const a = r.items.find((x) => x.isDefault) ?? r.items[0];
      if (a) setAddr((cur) => (cur.line1 ? cur : { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, pin: a.pin }));
      else setAddr((cur) => ({ ...cur, fullName: cur.fullName || user.name }));
    }).catch(() => undefined);
  }, [user]);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAddr((a) => ({ ...a, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [`shippingAddress.${k}`]: '' }));
  };

  const sig = useMemo(() => JSON.stringify([lines, cart.discountCode, provider, email, addr]), [lines, cart.discountCode, provider, email, addr]);
  const onPaid = useCallback(
    (o: OrderDTO) => {
      const token = session?.order.accessToken ?? '';
      clear();
      router.push(`/checkout/success?order=${encodeURIComponent(o.number)}&token=${encodeURIComponent(token)}`);
    },
    [clear, router, session],
  );
  const onFailed = useCallback(
    (reason?: string) => {
      if (!session) return;
      router.push(`/checkout/failed?order=${encodeURIComponent(session.order.number)}&token=${encodeURIComponent(session.order.accessToken)}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`);
    },
    [router, session],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const check = addressSchema.safeParse(addr);
    const fe: Record<string, string> = {};
    if (!check.success) for (const i of check.error.issues) fe[`shippingAddress.${i.path.join('.')}`] = i.message;
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = 'Enter a valid email address';
    if (!provider) fe.provider = 'No payment method is available right now';
    setErrors(fe);
    if (Object.keys(fe).length) {
      document.getElementById(Object.keys(fe)[0]!.replace('.', '-'))?.focus();
      return;
    }
    if (!priced?.ok) return setFormError('Your bag needs attention before you can pay — please review the items above.');
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const res = await call<CheckoutResultDTO>('/checkout', {
        body: { lines, email, shippingAddress: check.data, billingSameAsShipping: true, discountCode: cart.discountCode || undefined, provider, idempotencyKey: keyRef.current.key, subscribe },
      });
      setSession(res);
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) setErrors(f);
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!lines.length && !session) {
    return (
      <div className="container-x py-28 text-center">
        <h1 className="text-5xl">Your bag is empty</h1>
        <p className="mt-3 text-muted">Add something you love, then come back to check out.</p>
        <Link href="/collections/all" className="btn btn-primary mt-8">Shop the collection</Link>
      </div>
    );
  }

  return (
    <div className="container-x py-10 md:py-16">
      <h1 className="text-4xl md:text-6xl">Checkout</h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_26rem] lg:gap-20">
        <div>
          {session ? (
            <section aria-labelledby="pay-h" className="max-w-xl">
              <h2 id="pay-h" className="text-3xl">Payment</h2>
              <p className="mb-6 mt-2 text-sm text-muted">Order {session.order.number} · {formatMoney(session.order.total)}. Your stock is held for 30 minutes.</p>
              <PaymentSession result={session} onPaid={onPaid} onFailed={onFailed} />
              <button type="button" className="mt-6 text-sm underline underline-offset-4" onClick={() => setSession(null)}>← Edit details</button>
            </section>
          ) : (
            <form onSubmit={submit} noValidate className="max-w-2xl space-y-10">
              <fieldset className="space-y-4">
                <legend className="mb-2 text-2xl font-serif">Contact</legend>
                <Field id="email" label="Email address" error={errors.email}>
                  <input id="email" name="email" type="email" autoComplete="email" className="field" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: '' })); }} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} required />
                </Field>
                {!user && <p className="text-sm text-muted">Checking out as a guest. <Link href="/login?next=/checkout" className="underline underline-offset-4">Sign in</Link> to use saved addresses.</p>}
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-royal" checked={subscribe} onChange={(e) => setSubscribe(e.target.checked)} /> Email me about new arrivals</label>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-2 text-2xl font-serif">Delivery address</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {([
                    ['fullName', 'Full name', 'name', 'sm:col-span-2'],
                    ['phone', 'Mobile number', 'tel', ''],
                    ['pin', 'PIN code', 'postal-code', ''],
                    ['line1', 'Address', 'address-line1', 'sm:col-span-2'],
                    ['line2', 'Apartment, landmark (optional)', 'address-line2', 'sm:col-span-2'],
                    ['city', 'City', 'address-level2', ''],
                  ] as const).map(([k, label, ac, span]) => (
                    <div key={k} className={span}>
                      <Field id={`shippingAddress-${k}`} label={label} error={errors[`shippingAddress.${k}`]}>
                        <input id={`shippingAddress-${k}`} className="field" autoComplete={ac} inputMode={k === 'phone' || k === 'pin' ? 'numeric' : undefined} value={addr[k]} onChange={set(k)} aria-invalid={!!errors[`shippingAddress.${k}`]} aria-describedby={errors[`shippingAddress.${k}`] ? `shippingAddress-${k}-err` : undefined} />
                      </Field>
                    </div>
                  ))}
                  <Field id="shippingAddress-state" label="State" error={errors['shippingAddress.state']}>
                    <select id="shippingAddress-state" className="field" autoComplete="address-level1" value={addr.state} onChange={set('state')} aria-invalid={!!errors['shippingAddress.state']}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((s) => (<option key={s}>{s}</option>))}
                    </select>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="mb-2 text-2xl font-serif">Payment</legend>
                {providers.length === 0 && <p role="alert" className="text-sm text-danger">Online payments are not available right now. Please contact us to place your order.</p>}
                {providers.map((p) => (
                  <label key={p} className={`flex cursor-pointer items-center gap-3 border p-4 text-sm ${provider === p ? 'border-royal bg-white' : 'border-stone'}`}>
                    <input type="radio" name="provider" className="accent-royal" checked={provider === p} onChange={() => setProvider(p)} />
                    {PROVIDER_LABEL[p]}
                  </label>
                ))}
                <p className="text-xs text-muted">Card and UPI details are entered in the payment provider’s secure window — they never reach our servers.</p>
                {errors.provider && <p role="alert" className="text-xs text-danger">{errors.provider}</p>}
              </fieldset>

              {formError && <p role="alert" className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{formError}</p>}
              <button type="submit" className="btn btn-primary w-full sm:w-auto sm:min-w-72" disabled={busy || !priced?.ok || providers.length === 0}>
                {busy ? 'Placing your order…' : priced?.total != null ? `Continue to payment · ${formatMoney(priced.total)}` : 'Continue to payment'}
              </button>
              {priced && !priced.ok && <p className="text-sm text-danger" role="alert">{priced.shippingNote ?? 'Some items in your bag are unavailable. Please update your bag.'}</p>}
            </form>
          )}
        </div>

        <aside aria-label="Order summary" className="h-fit bg-white p-6 lg:sticky lg:top-28">
          <h2 className="text-2xl">Order summary</h2>
          <ul className="divide-y divide-line">
            {priced?.lines.map((l) => (
              <li key={l.variantId} className="flex gap-3 py-4">
                <div className="relative w-16 shrink-0">{l.image ? <ResponsiveImage image={l.image} sizes="64px" ratio="4 / 5" /> : <div className="aspect-[4/5] bg-line" />}<span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-royal px-1 text-[0.65rem] text-ivory">{l.qty}</span></div>
                <div className="min-w-0 flex-1 text-sm"><p className="leading-snug">{l.title}</p><p className="text-xs text-muted">{l.optionsLabel}</p>{l.issue && <p role="alert" className="text-xs text-danger">{l.issue === 'insufficient_stock' ? `Only ${l.maxQty} available` : 'Unavailable'}</p>}</div>
                <p className="text-sm tabular-nums">{formatMoney(l.lineTotal)}</p>
              </li>
            )) ?? <li className="py-6"><div className="skeleton h-16" /></li>}
          </ul>
          {!session && <div className="mb-4 mt-2"><DiscountField /></div>}
          <Totals />
          {settings?.tax.note && <p className="mt-3 text-xs text-muted">{settings.tax.note}</p>}
        </aside>
      </div>
    </div>
  );
}
