import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Collection, Product } from '../src/models';
import { importWooSnapshot, variantsFor } from '../src/services/importer';
import { startTestApp } from './helpers';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/woo-snapshot');
let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(() => t.reset());

describe('WooCommerce snapshot importer', () => {
  it('imports all products as drafts with preserved ids, slugs, SKUs and prices — nothing published', async () => {
    const report = await importWooSnapshot({ dir, log: () => {} });
    expect(report.products).toBe(109);
    expect(await Product.countDocuments()).toBe(109);
    expect(await Product.countDocuments({ status: 'published' })).toBe(0);
    const biker = (await Product.findOne({ slug: 'mens-brown-leather-biker-jacket' }))!;
    expect(biker.sku).toBe('BIKBRNJK4');
    expect(biker.provenance?.wooId).toBe(3628);
    expect(biker.variants.map((v) => v.price)).toEqual(Array(5).fill(1399900));
    expect(biker.variants[0]!.compareAtPrice).toBe(1899900);
    expect(biker.variants.map((v) => Object.fromEntries(v.options as Map<string, string>).Size).sort()).toEqual(['L-46', 'M-44', 'S-42', 'XL-48', 'XXL-50']);
    expect(biker.variants.every((v) => v.stock === null)).toBe(true); // stock is unknown, not invented
    expect(biker.blockers).toEqual(expect.arrayContaining(['No product photograph', 'Stock not entered (or mark made-to-order)']));
  });

  it('treats a price of 0 as missing (never "free")', async () => {
    await importWooSnapshot({ dir, log: () => {} });
    const zero = (await Product.findOne({ sku: 'DGNJK1' }))!;
    expect(zero.priceFrom).toBe(0);
    expect(zero.blockers).toContain('Price missing on an active variant');
  });

  it('builds colour variants from variations and keeps fixed single-term attributes as options', async () => {
    await importWooSnapshot({ dir, log: () => {} });
    const satchel = (await Product.findOne({ sku: 'CRBGWSC01' }))!;
    const colours = satchel.variants.map((v) => (v.options as unknown as Map<string, string>).get('Color'));
    expect(colours).toEqual(expect.arrayContaining(['Black', 'Chocolate Brown', 'Prussian Blue']));
    expect(new Set(satchel.variants.map((v) => v.sku)).size).toBe(satchel.variants.length); // unique SKUs
    const sample = (await Product.findOne({ sku: 'CRJKMGN03' }))!;
    expect((sample.variants[0]!.options as unknown as Map<string, string>).get('Color')).toBe('Grayish Black');
  });

  it('creates collections with the parent link and imports journal + policy pages', async () => {
    const report = await importWooSnapshot({ dir, log: () => {} });
    expect(report.articles).toBe(5);
    expect(report.pages).toBe(4);
    const mens = await Collection.findOne({ slug: 'mens-jacket' });
    expect(mens!.parent).toBe('jacket');
    const { Page } = await import('../src/models');
    const refund = await Page.findOne({ slug: 'refund-and-returns' });
    expect(refund!.body.length).toBeGreaterThan(200);
    expect(refund!.body).not.toMatch(/<script|elementor/i);
  });

  it('is idempotent and never overwrites a human edit', async () => {
    await importWooSnapshot({ dir, log: () => {}, limit: 12 });
    const p = (await Product.findOne({ sku: 'BIKBRNJK4' }))! ?? (await Product.findOne())!;
    p.variants[0]!.stock = 9;
    p.variants[0]!.price = 123456;
    p.description = 'Edited by an admin';
    await p.save();
    const again = await importWooSnapshot({ dir, log: () => {}, limit: 12 });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(12);
    expect(await Product.countDocuments()).toBe(12);
    const q = (await Product.findById(p._id))!;
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
});
