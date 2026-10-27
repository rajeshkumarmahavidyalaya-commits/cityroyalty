'use client';
import { useState } from 'react';
import { Badge, Field, Loading, Notice, PageHeader, Table } from '@/components/kit';
import { call, date, errorMessage, useResource } from '@/lib/api';

interface Art { id: string; title: string; slug: string; excerpt: string; body: string; status: 'draft' | 'published'; publishedAt: string | null; seo: { title?: string; description?: string } }
interface Pg { id?: string; slug: string; title: string; body: string; status: 'draft' | 'published' }

export default function Content() {
  const arts = useResource<{ items: Art[] }>('/admin/articles');
  const pages = useResource<{ items: Pg[] }>('/admin/pages');
  const [art, setArt] = useState<Partial<Art> | null>(null);
  const [pg, setPg] = useState<Pg | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  async function saveArt(e: React.FormEvent) {
    e.preventDefault(); if (!art) return;
    const body = { title: art.title ?? '', slug: art.slug || undefined, excerpt: art.excerpt ?? '', body: art.body ?? '', status: art.status ?? 'draft', seo: art.seo ?? {} };
    try { await (art.id ? call(`/admin/articles/${art.id}`, { method: 'PUT', body }) : call('/admin/articles', { body })); setArt(null); setMsg({ t: 'ok', s: 'Article saved.' }); await arts.reload(); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); }
  }
  async function savePg(e: React.FormEvent) {
    e.preventDefault(); if (!pg) return;
    try { const body = { title: pg.title, body: pg.body, status: pg.status }; await (pg.id ? call(`/admin/pages/${pg.id}`, { method: 'PUT', body }) : call('/admin/pages', { body: { ...body, slug: pg.slug || undefined } })); setPg(null); setMsg({ t: 'ok', s: 'Page saved.' }); await pages.reload(); } catch (x) { setMsg({ t: 'error', s: errorMessage(x) }); }
  }
  return (
    <div className="space-y-10">
      <PageHeader title="Journal & pages" sub="Rich text accepts simple HTML (headings, paragraphs, lists, links). Unsafe markup is removed on save." />
      {msg && <Notice tone={msg.t}>{msg.s}</Notice>}
      <section className="space-y-4" aria-label="Journal articles">
        <div className="flex items-center justify-between"><h2 className="text-2xl">Journal articles</h2><button className="btn btn-primary btn-sm" onClick={() => setArt({ status: 'draft', title: '' })}>New article</button></div>
        {art && (
          <form onSubmit={saveArt} className="card space-y-3">
            <Field label="Title" id="at"><input id="at" className="field" value={art.title ?? ''} onChange={(e) => setArt({ ...art, title: e.target.value })} required /></Field>
            <Field label="Slug" id="as"><input id="as" className="field" value={art.slug ?? ''} onChange={(e) => setArt({ ...art, slug: e.target.value })} /></Field>
            <Field label="Excerpt" id="ae"><input id="ae" className="field" maxLength={300} value={art.excerpt ?? ''} onChange={(e) => setArt({ ...art, excerpt: e.target.value })} /></Field>
            <Field label="Body (HTML)" id="ab"><textarea id="ab" rows={14} className="field font-mono text-xs" value={art.body ?? ''} onChange={(e) => setArt({ ...art, body: e.target.value })} /></Field>
            <div className="grid gap-3 md:grid-cols-2"><Field label="SEO title" id="ast"><input id="ast" className="field" value={art.seo?.title ?? ''} onChange={(e) => setArt({ ...art, seo: { ...art.seo, title: e.target.value } })} /></Field><Field label="SEO description" id="asd"><input id="asd" className="field" value={art.seo?.description ?? ''} onChange={(e) => setArt({ ...art, seo: { ...art.seo, description: e.target.value } })} /></Field></div>
            <Field label="Status" id="ass"><select id="ass" className="field !w-auto" value={art.status} onChange={(e) => setArt({ ...art, status: e.target.value as Art['status'] })}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
            <div className="flex gap-2"><button className="btn btn-primary">Save</button><button type="button" className="btn btn-ghost" onClick={() => setArt(null)}>Cancel</button></div>
          </form>
        )}
        {arts.loading && !arts.data ? <Loading /> : (
          <Table head={['Title', 'Status', 'Published', '']}>
            {arts.data?.items.map((a) => (<tr key={a.id}><td className="td">{a.title}<p className="text-xs text-muted">/journal/{a.slug}</p></td><td className="td"><Badge value={a.status} /></td><td className="td text-xs text-muted">{date(a.publishedAt)}</td><td className="td"><button className="btn btn-ghost btn-sm" onClick={() => setArt(a)}>Edit</button> <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete this article?')) { await call(`/admin/articles/${a.id}`, { method: 'DELETE' }); await arts.reload(); } }}>Delete</button></td></tr>))}
          </Table>
        )}
      </section>
      <section className="space-y-4" aria-label="Information pages">
        <div className="flex items-center justify-between"><h2 className="text-2xl">Information pages</h2><button className="btn btn-primary btn-sm" onClick={() => setPg({ slug: '', title: '', body: '', status: 'draft' })}>New page</button></div>
        <p className="text-xs text-muted">Pages listed in the footer: <code>faqs</code>, <code>shipping</code>, <code>refund-and-returns</code>, <code>lifetime-guarantee</code>, <code>privacy-policy</code>, <code>about</code> (shown once published). On <code>faqs</code>, each <code>&lt;h3&gt;</code> question with the paragraphs under it becomes a search-engine FAQ entry. A page with slug <code>size-guide</code> powers the size-guide dialog on product pages.</p>
        {pg && (
          <form onSubmit={savePg} className="card space-y-3">
            <Field label="Title" id="pt"><input id="pt" className="field" value={pg.title} onChange={(e) => setPg({ ...pg, title: e.target.value })} required /></Field>
            {!pg.id && <Field label="Slug" id="pslug"><input id="pslug" className="field" value={pg.slug} onChange={(e) => setPg({ ...pg, slug: e.target.value })} placeholder="from the title" /></Field>}
            <Field label="Body (HTML)" id="pb"><textarea id="pb" rows={16} className="field font-mono text-xs" value={pg.body} onChange={(e) => setPg({ ...pg, body: e.target.value })} /></Field>
            <Field label="Status" id="ps"><select id="ps" className="field !w-auto" value={pg.status} onChange={(e) => setPg({ ...pg, status: e.target.value as Pg['status'] })}><option value="published">Published</option><option value="draft">Draft</option></select></Field>
            <div className="flex gap-2"><button className="btn btn-primary">Save</button><button type="button" className="btn btn-ghost" onClick={() => setPg(null)}>Cancel</button></div>
          </form>
        )}
        <Table head={['Page', 'Status', '']}>{pages.data?.items.map((p) => (<tr key={p.id}><td className="td">{p.title}<p className="text-xs text-muted">/pages/{p.slug}</p></td><td className="td"><Badge value={p.status} /></td><td className="td"><button className="btn btn-ghost btn-sm" onClick={() => setPg(p)}>Edit</button></td></tr>))}</Table>
      </section>
    </div>
  );
}
