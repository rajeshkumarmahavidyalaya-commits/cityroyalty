'use client';
import { useEffect, useState } from 'react';
import type { SettingsInput } from '@cityroyalty/shared';
import { Field, Loading, Notice, PageHeader } from '@/components/kit';
import { call, errorMessage, useResource } from '@/lib/api';

const rs = (p: number | null | undefined) => (p == null ? '' : String(p / 100));
const toP = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));

export default function Settings() {
  const { data, loading } = useResource<SettingsInput>('/admin/settings');
  const [s, setS] = useState<SettingsInput | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (loading && !s) return <Loading />;
  if (!s) return null;
  const set = (p: Partial<SettingsInput>) => setS({ ...s, ...p });
  return (
    <form className="space-y-6" onSubmit={async (e) => { e.preventDefault(); setMsg(null); try { await call('/admin/settings', { method: 'PUT', body: s }); setMsg({ t: 'ok', s: 'Settings saved. The storefront updates within a minute.' }); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); } }}>
      <PageHeader title="Website settings" actions={<button className="btn btn-primary">Save settings</button>} />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      <Notice tone="warn">Unconfirmed values (flat shipping rate, return window, tax treatment) are deliberately blank. Leave them blank until confirmed — the storefront will not guess.</Notice>
      <section className="card grid gap-3 md:grid-cols-2"><h2 className="text-xl md:col-span-2">Store</h2>
        <Field label="Store name" id="n"><input id="n" className="field" value={s.storeName} onChange={(e) => set({ storeName: e.target.value })} /></Field>
        <Field label="Support email" id="e"><input id="e" type="email" className="field" value={s.supportEmail ?? ''} onChange={(e) => set({ supportEmail: e.target.value || undefined })} /></Field>
        <Field label="Support phone" id="p"><input id="p" className="field" value={s.supportPhone ?? ''} onChange={(e) => set({ supportPhone: e.target.value || undefined })} /></Field>
        <Field label="Address" id="a"><input id="a" className="field" value={s.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} /></Field>
        <Field label="Instagram URL" id="i"><input id="i" className="field" value={s.social.instagram ?? ''} onChange={(e) => set({ social: { ...s.social, instagram: e.target.value || undefined } })} /></Field>
        <Field label="Facebook URL" id="f"><input id="f" className="field" value={s.social.facebook ?? ''} onChange={(e) => set({ social: { ...s.social, facebook: e.target.value || undefined } })} /></Field>
        <div className="md:col-span-2"><Field label="Brand facts (one per line, shown on the homepage)" id="bf"><textarea id="bf" rows={4} className="field" value={s.brandFacts.join('\n')} onChange={(e) => set({ brandFacts: e.target.value.split('\n').filter(Boolean) })} /></Field></div>
      </section>
      <section className="card grid gap-3 md:grid-cols-2"><h2 className="text-xl md:col-span-2">Shipping &amp; payment</h2>
        <Field label="Free shipping over (₹)" id="ft" hint="Blank = never free"><input id="ft" className="field" inputMode="decimal" value={rs(s.shipping.freeThreshold)} onChange={(e) => set({ shipping: { ...s.shipping, freeThreshold: toP(e.target.value) } })} /></Field>
        <Field label="Flat shipping rate below that (₹)" id="fr" hint="Blank = unknown → such orders cannot check out"><input id="fr" className="field" inputMode="decimal" value={rs(s.shipping.flatRate)} onChange={(e) => set({ shipping: { ...s.shipping, flatRate: toP(e.target.value) } })} /></Field>
        <Field label="Delivery estimate text" id="de" hint="Shown on product pages only when filled. Don’t promise what you can’t keep."><input id="de" className="field" value={s.shipping.estimate ?? ''} onChange={(e) => set({ shipping: { ...s.shipping, estimate: e.target.value || undefined } })} /></Field>
        <div className="flex items-end gap-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.shipping.codEnabled} onChange={(e) => set({ shipping: { ...s.shipping, codEnabled: e.target.checked } })} /> Cash on delivery</label><Field label="COD fee (₹)" id="cf"><input id="cf" className="field !w-28" inputMode="decimal" value={rs(s.shipping.codFee)} onChange={(e) => set({ shipping: { ...s.shipping, codFee: toP(e.target.value) ?? 0 } })} /></Field></div>
      </section>
      <section className="card grid gap-3 md:grid-cols-2"><h2 className="text-xl md:col-span-2">Tax &amp; returns</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.tax.pricesIncludeTax} onChange={(e) => set({ tax: { ...s.tax, pricesIncludeTax: e.target.checked } })} /> Prices include tax</label>
        <Field label="Tax note (footer / checkout)" id="tn"><input id="tn" className="field" value={s.tax.note ?? ''} onChange={(e) => set({ tax: { ...s.tax, note: e.target.value || undefined } })} /></Field>
        <Field label="Return window (days)" id="rw" hint="Blank = not stated"><input id="rw" className="field" inputMode="numeric" value={s.returns.windowDays ?? ''} onChange={(e) => set({ returns: { ...s.returns, windowDays: e.target.value === '' ? null : Number(e.target.value) } })} /></Field>
        <Field label="Returns summary (product pages)" id="rs"><input id="rs" className="field" value={s.returns.summary ?? ''} onChange={(e) => set({ returns: { ...s.returns, summary: e.target.value || undefined } })} /></Field>
      </section>
    </form>
  );
}
