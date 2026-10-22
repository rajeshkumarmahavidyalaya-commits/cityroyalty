'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { IMAGE_SLOTS } from '@cityroyalty/shared';
import { call, errorMessage, money, useResource } from '@/lib/api';
import { Badge, Field, Loading, Notice, PageHeader } from './kit';
import { useStaff } from './Shell';

interface Variant { id?: string; sku: string; options: Record<string, string>; price: number; compareAtPrice: number | null; stock: number | null; madeToOrder: boolean; active: boolean }
interface Img { id: string; slot: string; kind: string; alt: string; colour: string; src: string; width: number; height: number }
interface Product {
  id: string; title: string; slug: string; sku: string; status: string; blockers: string[]; description: string; highlights: string[]; material: string; care: string;
  collections: string[]; tags: string[]; options: { name: string; values: string[] }[]; variants: Variant[]; images: Img[];
  seo: { title: string; description: string; noindex: boolean }; featured: boolean; priceFrom: number; publishedAt: string | null; provenance?: { source?: string; wooId?: number; permalink?: string };
}
interface Cols { items: { slug: string; title: string; parent: string | null }[] }

const empty = (): Product => ({
  id: '', title: '', slug: '', sku: '', status: 'draft', blockers: [], description: '', highlights: [], material: '', care: '', collections: [], tags: [], options: [],
  variants: [{ sku: '', options: {}, price: 0, compareAtPrice: null, stock: null, madeToOrder: false, active: true }], images: [], seo: { title: '', description: '', noindex: false }, featured: false, priceFrom: 0, publishedAt: null,
});
const rupees = (p: number | null) => (p == null ? '' : String(p / 100));
const toPaise = (s: string) => (s.trim() === '' ? 0 : Math.round(Number(s) * 100));

export function ProductEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const { user } = useStaff();
  const canPublish = user.role !== 'content';
  const res = useResource<Product>(id ? `/admin/products/${id}` : null);
  const cols = useResource<Cols>('/admin/collections');
  const [p, setP] = useState<Product>(empty());
  const [optNames, setOptNames] = useState('Size');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (res.data) {
      setP(res.data);
      setOptNames(res.data.options.map((o) => o.name).join(', '));
    }
  }, [res.data]);

  const names = useMemo(() => optNames.split(',').map((s) => s.trim()).filter(Boolean), [optNames]);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVar = (i: number, patch: Partial<Variant>) => setP((x) => ({ ...x, variants: x.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  function payload() {
    const options = names.map((name) => ({ name, values: [...new Set(p.variants.filter((v) => v.active).map((v) => v.options[name]?.trim()).filter((x): x is string => Boolean(x)))] })).filter((o) => o.values.length);
    return {
      title: p.title, slug: p.slug || undefined, sku: p.sku, description: p.description,
      highlights: p.highlights.filter(Boolean), material: p.material || undefined, care: p.care || undefined, collections: p.collections, tags: p.tags, options,
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, options: Object.fromEntries(Object.entries(v.options).filter(([k, val]) => names.includes(k) && val.trim())), price: v.price, compareAtPrice: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null, stock: v.madeToOrder ? v.stock : v.stock, madeToOrder: v.madeToOrder, active: v.active })),
      seo: { title: p.seo.title || undefined, description: p.seo.description || undefined, noindex: p.seo.noindex || undefined }, featured: p.featured,
    };
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const saved = id ? await call<Product>(`/admin/products/${id}`, { method: 'PUT', body: payload() }) : await call<Product>('/admin/products', { body: payload() });
      if (!id) return router.replace(`/products/${saved.id}`);
      setP(saved);
      setMsg({ tone: 'ok', text: saved.status !== p.status ? `Saved. The product returned to “${saved.status}” because it has blockers.` : 'Saved.' });
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(false); }
  }
  async function setStatus(status: string) {
    setBusy(true); setMsg(null);
    try { setP(await call<Product>(`/admin/products/${id}/status`, { body: { status } })); setMsg({ tone: 'ok', text: `Status: ${status}` }); }
    catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(false); }
  }
  async function upload(file: File, slot: string, kind: string, alt: string) {
    const fd = new FormData();
    fd.set('file', file); fd.set('slot', slot); fd.set('kind', kind); fd.set('alt', alt);
    setBusy(true); setMsg(null);
    try { setP(await call<Product>(`/admin/products/${id}/images`, { form: fd })); setMsg({ tone: 'ok', text: 'Image uploaded and optimised (AVIF + WebP).' }); }
    catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(false); }
  }

  if (id && res.loading && !res.data) return <Loading />;
  if (id && res.error) return <Notice tone="error">{res.error.message}</Notice>;

  return (
    <div className="space-y-8">
      <PageHeader
        title={id ? p.title || 'Product' : 'New product'}
        sub={id && <><Badge value={p.status} /> {p.provenance?.source === 'woocommerce' && <span className="ml-2 text-xs">Imported from WooCommerce #{p.provenance.wooId}</span>}</>}
        actions={<><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {id && (
        <section className="card space-y-3" aria-label="Publication">
          <h2 className="text-xl">Publication</h2>
          {p.blockers.length > 0 ? (
            <div><p className="text-sm font-medium">Resolve before this can move forward:</p><ul className="mt-1 list-disc pl-5 text-sm text-danger">{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
          ) : <p className="text-sm text-ok">All publication checks pass.</p>}
          <div className="flex flex-wrap gap-2">
            {p.status === 'draft' && <button className="btn btn-ghost" disabled={busy || p.blockers.length > 0} onClick={() => setStatus('review')}>Send to review</button>}
            {p.status === 'review' && canPublish && <button className="btn btn-primary" disabled={busy || p.blockers.length > 0} onClick={() => setStatus('published')}>Publish</button>}
            {p.status === 'review' && !canPublish && <p className="text-sm text-muted">Waiting for a manager to publish.</p>}
            {(p.status === 'review' || p.status === 'published') && <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('draft')}>Back to draft</button>}
            {canPublish && p.status !== 'archived' && <button className="btn btn-danger" disabled={busy} onClick={() => setStatus('archived')}>Archive</button>}
            {p.status === 'archived' && canPublish && <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('draft')}>Restore as draft</button>}
          </div>
        </section>
      )}

      <section className="card space-y-4" aria-label="Details">
        <h2 className="text-xl">Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title" id="t"><input id="t" className="field" value={p.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="SKU" id="s"><input id="s" className="field" value={p.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="URL slug" id="sl" hint={id ? 'Changing the slug changes the product URL (SEO). Leave unchanged to keep legacy links.' : 'Generated from the title when empty.'}><input id="sl" className="field" value={p.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={p.featured} onChange={(e) => set('featured', e.target.checked)} /> Featured on the homepage</label>
        </div>
        <Field label="Description" id="d" hint="Plain text; blank lines separate paragraphs. Only enter facts you can verify."><textarea id="d" rows={7} className="field" value={p.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Material" id="m" hint="Shown on the product page only if filled."><input id="m" className="field" value={p.material} onChange={(e) => set('material', e.target.value)} /></Field>
          <Field label="Care" id="c"><input id="c" className="field" value={p.care} onChange={(e) => set('care', e.target.value)} /></Field>
        </div>
        <Field label="Highlights (one per line)" id="h"><textarea id="h" rows={3} className="field" value={p.highlights.join('\n')} onChange={(e) => set('highlights', e.target.value.split('\n'))} /></Field>
        <fieldset>
          <legend className="label">Collections</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {cols.data?.items.map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.collections.includes(c.slug)} onChange={(e) => set('collections', e.target.checked ? [...p.collections, c.slug] : p.collections.filter((x) => x !== c.slug))} />{c.title}</label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4" aria-label="Variants and stock">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl">Variants, prices &amp; stock</h2>
          <Field label="Option names (comma separated)" id="on"><input id="on" className="field !w-64" value={optNames} onChange={(e) => setOptNames(e.target.value)} placeholder="Size, Color" /></Field>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{['SKU', ...names, 'Price ₹', 'Compare-at ₹', 'Stock', 'Made to order', 'Active', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {p.variants.map((v, i) => (
                <tr key={v.id ?? `n${i}`}>
                  <td className="td"><input aria-label="Variant SKU" className="field !w-36" value={v.sku} onChange={(e) => setVar(i, { sku: e.target.value })} /></td>
                  {names.map((n) => (<td key={n} className="td"><input aria-label={n} className="field !w-28" value={v.options[n] ?? ''} onChange={(e) => setVar(i, { options: { ...v.options, [n]: e.target.value } })} /></td>))}
                  <td className="td"><input aria-label="Price in rupees" inputMode="decimal" className="field !w-28" value={rupees(v.price)} onChange={(e) => setVar(i, { price: toPaise(e.target.value) })} /></td>
                  <td className="td"><input aria-label="Compare-at price in rupees" inputMode="decimal" className="field !w-28" value={rupees(v.compareAtPrice)} onChange={(e) => setVar(i, { compareAtPrice: e.target.value ? toPaise(e.target.value) : null })} /></td>
                  <td className="td"><input aria-label="Stock" inputMode="numeric" className="field !w-24" placeholder="unknown" value={v.stock ?? ''} onChange={(e) => setVar(i, { stock: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} /></td>
                  <td className="td text-center"><input aria-label="Made to order" type="checkbox" checked={v.madeToOrder} onChange={(e) => setVar(i, { madeToOrder: e.target.checked })} /></td>
                  <td className="td text-center"><input aria-label="Active" type="checkbox" checked={v.active} onChange={(e) => setVar(i, { active: e.target.checked })} /></td>
                  <td className="td"><button className="btn btn-ghost btn-sm" disabled={p.variants.length === 1} onClick={() => setP((x) => ({ ...x, variants: x.variants.filter((_, j) => j !== i) }))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setP((x) => ({ ...x, variants: [...x.variants, { sku: '', options: {}, price: x.variants[0]?.price ?? 0, compareAtPrice: x.variants[0]?.compareAtPrice ?? null, stock: null, madeToOrder: false, active: true }] }))}>Add variant</button>
          <p className="text-xs text-muted">Empty stock means “unknown” — such a variant cannot be sold. {p.priceFrom ? `From ${money(p.priceFrom)}.` : ''}</p>
        </div>
      </section>

      {id ? <Images product={p} onUpload={upload} onChange={setP} busy={busy} setMsg={setMsg} /> : <Notice>Save the product to add photographs.</Notice>}

      <section className="card space-y-4" aria-label="SEO">
        <h2 className="text-xl">Search &amp; sharing</h2>
        <Field label="Page title" id="st" hint="Defaults to the product title."><input id="st" className="field" maxLength={70} value={p.seo.title} onChange={(e) => set('seo', { ...p.seo, title: e.target.value })} /></Field>
        <Field label="Meta description" id="sd"><textarea id="sd" className="field" rows={2} maxLength={170} value={p.seo.description} onChange={(e) => set('seo', { ...p.seo, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.seo.noindex} onChange={(e) => set('seo', { ...p.seo, noindex: e.target.checked })} /> Hide from search engines</label>
      </section>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-line bg-ivory/95 p-4 backdrop-blur lg:-mx-8 lg:px-8"><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </div>
  );
}

function Images({ product: p, onUpload, onChange, busy, setMsg }: { product: Product; onUpload: (f: File, slot: string, kind: string, alt: string) => Promise<void>; onChange: (p: Product) => void; busy: boolean; setMsg: (m: { tone: 'ok' | 'error'; text: string } | null) => void }) {
  const [slot, setSlot] = useState('front');
  const [kind, setKind] = useState('photo');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  return (
    <section className="card space-y-4" aria-label="Images">
      <h2 className="text-xl">Photography</h2>
      <p className="text-xs text-muted">Five slots: front/model, side or back, studio, close-up detail, lifestyle. Only <b>photo</b> images of the real product can be published; <b>concept</b> images (AI/mock-ups) never appear on the storefront.</p>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
        {p.images.map((im) => (
          <li key={im.id} className="space-y-2 border border-line p-2 text-xs">
            
            <img src={im.src} alt={im.alt} className="aspect-[4/5] w-full bg-line object-cover" loading="lazy" />
            <div className="flex items-center justify-between"><Badge value={im.kind} /><span className="text-muted">{im.slot}</span></div>
            <label className="sr-only" htmlFor={`alt-${im.id}`}>Alt text</label>
            <input id={`alt-${im.id}`} className="field !min-h-8 !text-xs" defaultValue={im.alt} onBlur={async (e) => { if (e.target.value !== im.alt) { try { onChange(await call<Product>(`/admin/products/${p.id}/images/${im.id}`, { method: 'PATCH', body: { alt: e.target.value } })); } catch (x) { setMsg({ tone: 'error', text: errorMessage(x) }); } } }} />
            <div className="flex gap-1">
              <select aria-label="Slot" className="field !min-h-8 !px-1 !text-xs" value={im.slot} onChange={async (e) => onChange(await call<Product>(`/admin/products/${p.id}/images/${im.id}`, { method: 'PATCH', body: { slot: e.target.value } }))}>{IMAGE_SLOTS.map((s) => <option key={s}>{s}</option>)}</select>
              <select aria-label="Kind" className="field !min-h-8 !px-1 !text-xs" value={im.kind} onChange={async (e) => { try { onChange(await call<Product>(`/admin/products/${p.id}/images/${im.id}`, { method: 'PATCH', body: { kind: e.target.value } })); } catch (x) { setMsg({ tone: 'error', text: errorMessage(x) }); } }}><option>photo</option><option>concept</option></select>
            </div>
            <button className="btn btn-danger btn-sm w-full" onClick={async () => { if (confirm('Delete this image?')) onChange(await call<Product>(`/admin/products/${p.id}/images/${im.id}`, { method: 'DELETE' })); }}>Delete</button>
          </li>
        ))}
        {p.images.length === 0 && <li className="col-span-full text-sm text-muted">No images yet.</li>}
      </ul>
      <form className="grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_8rem_8rem_2fr_auto]" onSubmit={async (e) => { e.preventDefault(); if (!file) return; const f = file; const a = alt || p.title; setFile(null); setAlt(''); (e.target as HTMLFormElement).reset(); await onUpload(f, slot, kind, a); }}>
        <div><label className="label" htmlFor="file">Image file (JPEG, PNG, WebP, AVIF · min 200px · max 15 MB)</label><input id="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div><label className="label" htmlFor="slot">Slot</label><select id="slot" className="field" value={slot} onChange={(e) => setSlot(e.target.value)}>{IMAGE_SLOTS.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label" htmlFor="kind">Kind</label><select id="kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}><option>photo</option><option>concept</option></select></div>
        <div><label className="label" htmlFor="alt">Alt text</label><input id="alt" className="field" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe what is visible" /></div>
        <button className="btn btn-primary self-end" disabled={!file || busy}>Upload</button>
      </form>
    </section>
  );
}
