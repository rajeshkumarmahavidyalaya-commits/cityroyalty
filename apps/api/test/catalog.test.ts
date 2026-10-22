import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Product } from '../src/models';
import { makeCollection, makeProduct, photo, startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.stop());
beforeEach(() => t.reset());

describe('public catalogue', () => {
  it('lists only published products and hides drafts/archived', async () => {
    await makeCollection();
    await makeProduct({ title: 'Live', slug: 'live' });
    await makeProduct({ title: 'Hidden', slug: 'hidden', status: 'draft' });
    const res = await request(t.app).get('/api/v1/products');
    expect(res.body.items.map((i: { slug: string }) => i.slug)).toEqual(['live']);
    expect((await request(t.app).get('/api/v1/products/hidden')).status).toBe(404);
    expect((await request(t.app).get('/api/v1/products/live')).status).toBe(200);
  });

  it('never exposes concept images, even if one is attached to a published product', async () => {
    await makeProduct({ slug: 'mixed', images: [photo('real'), { ...photo('concept art'), kind: 'concept', slot: 'lifestyle', src: 'https://cdn.test/concept.webp' }] });
    const res = await request(t.app).get('/api/v1/products/mixed');
    expect(res.body.product.images).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('concept');
  });

  it('exposes stock only as availability, plus a real low-stock number', async () => {
    await makeProduct({ slug: 'few', stock: 2, sizes: ['M-44'] });
    const v = (await request(t.app).get('/api/v1/products/few')).body.product.variants[0];
    expect(v.available).toBe(true);
    expect(v.lowStock).toBe(2);
    expect(v).not.toHaveProperty('stock');
  });

  it('filters, sorts and facets', async () => {
    await makeCollection('mens-jacket');
    await makeCollection('belts', 'Belts');
    await makeProduct({ title: 'Cheap belt', slug: 'cheap', price: 99900, collections: ['belts'], sizes: ['One'] });
    await makeProduct({ title: 'Pricey jacket', slug: 'pricey', price: 1399900, sizes: ['M-44', 'L-46'] });
    await makeProduct({ title: 'Sold out jacket', slug: 'sold', price: 799900, stock: 0, sizes: ['M-44'] });
    const asc = await request(t.app).get('/api/v1/products?sort=price-asc');
    expect(asc.body.items.map((i: { slug: string }) => i.slug)).toEqual(['cheap', 'sold', 'pricey']);
    expect((await request(t.app).get('/api/v1/products?collection=belts')).body.items).toHaveLength(1);
    expect((await request(t.app).get('/api/v1/products?size=L-46')).body.items.map((i: { slug: string }) => i.slug)).toEqual(['pricey']);
    expect((await request(t.app).get('/api/v1/products?inStock=true')).body.total).toBe(2);
    expect((await request(t.app).get('/api/v1/products?minPrice=500000&maxPrice=900000')).body.items.map((i: { slug: string }) => i.slug)).toEqual(['sold']);
    const facets = (await request(t.app).get('/api/v1/products')).body.facets;
    expect(facets.sizes).toEqual(expect.arrayContaining(['M-44', 'L-46', 'One']));
    expect(facets.price).toEqual({ min: 99900, max: 1399900 });
  });

  it('searches title/sku and paginates', async () => {
    await makeCollection();
    for (let i = 0; i < 5; i++) await makeProduct({ title: `Maroon Jacket ${i}`, slug: `maroon-${i}` });
    await makeProduct({ title: 'Black Belt', slug: 'black-belt' });
    const s = await request(t.app).get('/api/v1/search?q=maroon jack');
    expect(s.body.total).toBe(5);
    const page = await request(t.app).get('/api/v1/products?limit=2&page=3');
    expect(page.body.items).toHaveLength(2);
    expect(page.body.pages).toBe(3);
    expect((await request(t.app).get('/api/v1/search?q=%28%28')).status).toBe(200); // regex-hostile input is escaped
  });

  it('only lists collections that contain published products, and the tree rolls children up', async () => {
    await makeCollection('jacket', 'Jackets');
    await makeCollection('mens-jacket', "Men's", 'jacket');
    await makeCollection('jewellery', 'Jewellery');
    await makeProduct({ slug: 'm', collections: ['mens-jacket'] });
    const list = (await request(t.app).get('/api/v1/collections')).body.items.map((c: { slug: string }) => c.slug);
    expect(list).toEqual(expect.arrayContaining(['jacket', 'mens-jacket']));
    expect(list).not.toContain('jewellery'); // no confirmed products → not shown
    expect((await request(t.app).get('/api/v1/collections/jewellery')).status).toBe(404);
    expect((await request(t.app).get('/api/v1/products?collection=jacket')).body.total).toBe(1);
  });

  it('computes derived fields on save', async () => {
    const p = await makeProduct({ stock: 0, sizes: ['M-44'] });
    expect(p.available).toBe(false);
    expect(p.priceFrom).toBe(799900);
    expect(p.compareAtFrom).toBe(1599900);
    expect(p.sizes).toEqual(['M-44']);
    const q = await Product.create({ title: 'x', slug: 'x', sku: 'x', collections: [], variants: [{ sku: 'x', options: {}, price: 0, stock: null }], images: [] });
    expect(q.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it('serves public settings without exposing secrets', async () => {
    const res = await request(t.app).get('/api/v1/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.paymentProviders).toContain('mock');
    expect(JSON.stringify(res.body)).not.toMatch(/secret|webhook/i);
    expect(res.body.returns.windowDays).toBeNull(); // unconfirmed → null, never a guessed number
  });

  it('accepts newsletter signups idempotently', async () => {
    await request(t.app).post('/api/v1/newsletter').send({ email: 'N@x.com' }).expect(201);
    await request(t.app).post('/api/v1/newsletter').send({ email: 'n@x.com' }).expect(201);
    expect(await (await import('../src/models')).Subscriber.countDocuments()).toBe(1);
    await request(t.app).post('/api/v1/newsletter').send({ email: 'bad' }).expect(400);
  });
});

describe('media', () => {
  it('returns 404 (not 500) for a missing media file', async () => {
    const res = await request(t.app).get('/media/images/nope/320.avif');
    expect(res.status).toBe(404);
  });
});
