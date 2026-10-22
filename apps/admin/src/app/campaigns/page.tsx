'use client';
import { useEffect, useState } from 'react';
import { Field, Loading, Notice, PageHeader } from '@/components/kit';
import { call, errorMessage, useResource } from '@/lib/api';

interface Camp { key: string; headline: string; subline: string; ctaLabel: string; ctaHref: string; image: string | null; imageAlt: string; active: boolean }
const KEYS = [
  { key: 'home-editorial', label: 'Homepage editorial banner', hint: 'The large story block between “New arrivals” and “Featured”. Use an approved real photograph.' },
  { key: 'announcement', label: 'Announcement', hint: 'Short message (stored for the announcement bar).' },
] as const;
const blank = (key: string): Camp => ({ key, headline: '', subline: '', ctaLabel: '', ctaHref: '', image: null, imageAlt: '', active: true });

export default function Campaigns() {
  const { data, loading } = useResource<{ items: Camp[] }>('/admin/campaigns');
  const [forms, setForms] = useState<Record<string, Camp>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  useEffect(() => { if (data) setForms(Object.fromEntries(KEYS.map((k) => [k.key, data.items.find((c) => c.key === k.key) ?? blank(k.key)]))); }, [data]);
  if (loading && !data) return <Loading />;
  async function upload(key: string, file: File) {
    const fd = new FormData(); fd.set('file', file);
    try { const r = await call<{ url: string }>('/admin/uploads', { form: fd }); setForms((f) => ({ ...f, [key]: { ...f[key]!, image: r.url } })); } catch (e) { setMsg({ t: 'error', s: errorMessage(e) }); }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Homepage campaigns" sub="Editorial content shown on the storefront homepage." />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      {KEYS.map(({ key, label, hint }) => { const f = forms[key]; if (!f) return null; const set = (p: Partial<Camp>) => setForms({ ...forms, [key]: { ...f, ...p } }); return (
        <form key={key} className="card grid gap-3 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); try { await call('/admin/campaigns', { method: 'PUT', body: { ...f, image: f.image || null } }); setMsg({ t: 'ok', s: `${label} saved.` }); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); } }}>
          <div className="md:col-span-2"><h2 className="text-xl">{label}</h2><p className="text-xs text-muted">{hint}</p></div>
          <Field label="Headline" id={`${key}h`}><input id={`${key}h`} className="field" value={f.headline} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-line" id={`${key}s`}><input id={`${key}s`} className="field" value={f.subline} onChange={(e) => set({ subline: e.target.value })} /></Field>
          <Field label="Button label" id={`${key}l`}><input id={`${key}l`} className="field" value={f.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} /></Field>
          <Field label="Button link" id={`${key}u`}><input id={`${key}u`} className="field" value={f.ctaHref} onChange={(e) => set({ ctaHref: e.target.value })} placeholder="/collections/mens-jacket" /></Field>
          {key !== 'announcement' && (<>
            <Field label="Image" id={`${key}i`}><input id={`${key}i`} type="file" accept="image/*" className="field" onChange={(e) => e.target.files?.[0] && upload(key, e.target.files[0])} />{f.image && <img src={f.image} alt={f.imageAlt} className="mt-2 h-32 object-cover" />}</Field>
            <Field label="Image alt text" id={`${key}a`}><input id={`${key}a`} className="field" value={f.imageAlt} onChange={(e) => set({ imageAlt: e.target.value })} /></Field>
          </>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
          <div className="md:col-span-2"><button className="btn btn-primary">Save</button></div>
        </form>
      ); })}
    </div>
  );
}
