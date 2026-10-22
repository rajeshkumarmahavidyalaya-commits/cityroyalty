import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { auditLogs, collections, pages, productImages, products, variants } from '../src/db/schema';
import { importWooSnapshot, variantsFor } from '../src/services/importer';
import { count, productBy, sessionFor, startTestApp } from './helpers';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/woo-snapshot');
let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(() => t.reset());

describe('WooCommerce snapshot importer', () => {
  it('imports all products as drafts with preserved ids, slugs, SKUs and prices — nothing published', async () => {
    const report = await importWooSnapshot({ dir, log: () => {} });
    expect(report.products).toBe(109);
    expect(await count(products)).toBe(109);
    expect(await count(products, eq(products.status, 'published'))).toBe(0);
    const biker = (await productBy('slug', 'mens-brown-leather-biker-jacket'))!;
    expect(biker.sku).toBe('BIKBRNJK4');
    expect(biker.provenance?.wooId).toBe(3628);
    expect(biker.variants.map((v) => v.price)).toEqual(Array(5).fill(1399900));
    expect(biker.variants[0]!.compareAtPrice).toBe(1899900);
    expect(biker.variants.map((v) => v.options.Size).sort()).toEqual(['L-46', 'M-44', 'S-42', 'XL-48', 'XXL-50']);
    expect(biker.variants.every((v) => v.stock === null)).toBe(true); // stock is unknown, not invented
    expect(biker.blockers).toEqual(expect.arrayContaining(['No product photograph', 'Stock not entered (or mark made-to-order)']));
  });

  it('treats a price of 0 as missing (never "free")', async () => {
    await importWooSnapshot({ dir, log: () => {} });
    const zero = (await productBy('sku', 'DGNJK1'))!;
    expect(zero.priceFrom).toBe(0);
    expect(zero.blockers).toContain('Price missing on an active variant');
  });

  it('builds colour variants from variations and keeps fixed single-term attributes as options', async () => {
    await importWooSnapshot({ dir, log: () => {} });
    const satchel = (await productBy('sku', 'CRBGWSC01'))!;
    const colours = satchel.variants.map((v) => v.options.Color);
    expect(colours).toEqual(expect.arrayContaining(['Black', 'Chocolate Brown', 'Prussian Blue']));
    expect(new Set(satchel.variants.map((v) => v.sku)).size).toBe(satchel.variants.length); // unique SKUs
    const sample = (await productBy('sku', 'CRJKMGN03'))!;
    expect(sample.variants[0]!.options.Color).toBe('Grayish Black');
  });

  it('creates collections with the parent link and imports journal + policy pages', async () => {
    const report = await importWooSnapshot({ dir, log: () => {} });
    expect(report.articles).toBe(5);
    expect(report.pages).toBe(4);
    const [mens] = await db().select().from(collections).where(eq(collections.slug, 'mens-jacket'));
    expect(mens!.parent).toBe('jacket');
    const [refund] = await db().select().from(pages).where(eq(pages.slug, 'refund-and-returns'));
    expect(refund!.body.length).toBeGreaterThan(200);
    expect(refund!.body).not.toMatch(/<script|elementor/i);
  });

  it('is idempotent and never overwrites a human edit', async () => {
    await importWooSnapshot({ dir, log: () => {}, limit: 12 });
    const p = (await productBy('sku', 'BIKBRNJK4'))!;
    await db().update(variants).set({ stock: 9, price: 123456 }).where(eq(variants.id, p.variants[0]!.id));
    await db().update(products).set({ description: 'Edited by an admin' }).where(eq(products.id, p.id));
    const again = await importWooSnapshot({ dir, log: () => {}, limit: 12 });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(12);
    expect(await count(products)).toBe(12);
    const q = (await productBy('sku', 'BIKBRNJK4'))!;
    expect(q.variants[0]!.stock).toBe(9);
    expect(q.variants[0]!.price).toBe(123456);
    expect(q.description).toBe('Edited by an admin');
  });

  it('maps variations deterministically', () => {
    const v = variantsFor({
      type: 'variable', attributes: [{ name: 'Color', terms: ['Black'], hasVariations: false }, { name: 'Size', terms: ['M-44', 'L-46'], hasVariations: true }],
      variations: [{ wooId: 1, attributes: { Size: 'm-44' } }, { wooId: 2, attributes: { Size: 'l-46' } }, { wooId: 3, attributes: { Size: 'l-46' } }],
    } as never);
    expect(v).toEqual([{ options: { Color: 'Black', Size: 'M-44' } }, { options: { Color: 'Black', Size: 'L-46' } }]);
  });

  it('attaches already-uploaded photos from a media manifest without downloading anything', async () => {
    const products_ = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir, 'products.json'), 'utf8')) as { sku: string; images: { src: string }[] }[];
    const biker = products_.find((p) => p.sku === 'BIKBRNJK4')!;
    // first occurrence wins: the Woo data repeats some URLs within a product
    const manifest = Object.fromEntries(biker.images.map((img, i) => [img.src, { key: `k${i}`, width: 1200, height: 1500, bytes: 1, widths: [640, 1200], blur: 'data:image/webp;base64,AA' }]).reverse());
    const storage = { put: async () => { throw new Error('must not upload'); }, url: (k: string) => `https://cdn.test/${k}` };
    const fetchImpl = (async () => { throw new Error('must not download'); }) as unknown as typeof fetch;
    const report = await importWooSnapshot({ dir, storage, mediaManifest: manifest, fetchImpl, log: () => {} });
    expect(report.images).toBe(biker.images.length);
    const p = (await productBy('sku', 'BIKBRNJK4'))!;
    expect(p.images[0]!.webp).toEqual([{ w: 640, url: 'https://cdn.test/images/k0/640.webp' }, { w: 1200, url: 'https://cdn.test/images/k0/1200.webp' }]);
    expect(p.images[0]!.src).toBe('https://cdn.test/images/k0/1200.webp');
    expect(p.blockers).not.toContain('No product photograph');
  });

  it('lets only admins run the bundled snapshot import, and audits it', async () => {
    const mgr = await sessionFor(t.app, 'manager');
    expect((await mgr.post('/api/v1/admin/import/woo', {})).status).toBe(403);
    const admin = await sessionFor(t.app, 'admin');
    const res = await admin.post('/api/v1/admin/import/woo', {});
    expect(res.status).toBe(200);
    expect(res.body.products).toBe(109);
    expect(await count(products, eq(products.status, 'published'))).toBe(0);
    expect(await count(auditLogs, eq(auditLogs.action, 'catalogue.import'))).toBe(1);
    void productImages;
  });
});
