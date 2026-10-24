import { expect, test } from '@playwright/test';

test.describe('SEO & redirects', () => {
  test('robots + sitemap list published products only', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap:');
    expect(robots).toMatch(/Disallow: \/checkout/);
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain('/products/mens-brown-leather-biker-jacket');
    expect(xml).not.toContain('mens-dark-green-leather'); // draft
    expect(xml).not.toContain('/collections/jewellery'); // no published products
    expect(xml).toContain('<image:loc>'); // product photographs in the image sitemap
    expect(xml).not.toContain('/pages/faqs'); // unpublished placeholder page is not submitted
    expect(robots).toMatch(/User-Agent: GPTBot/i); // AI search crawlers are explicitly welcome
  });

  test('llms.txt summarises the live catalogue for AI assistants', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.headers()['content-type']).toContain('text/plain');
    const text = await res.text();
    expect(text.startsWith('# City Royalty')).toBe(true);
    expect(text).toContain('/collections/mens-jacket');
    expect(text).toContain('/products/mens-brown-leather-biker-jacket');
    expect(text).not.toContain('mens-dark-green-leather'); // drafts never listed
  });

  test('product page metadata, canonical, JSON-LD and breadcrumbs', async ({ page }) => {
    await page.goto('/products/mens-brown-leather-biker-jacket');
    await expect(page).toHaveTitle(/Biker Jacket \| City Royalty/);
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toMatch(/\/products\/mens-brown-leather-biker-jacket$/);
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('Biker');
    const description = await page.locator('meta[name=description]').getAttribute('content');
    expect(description).toMatch(/^Men’s Brown Leather Biker Jacket by City Royalty/); // answer-style, not a cut-off paragraph
    expect(description!.length).toBeLessThanOrEqual(160);
    const nodes = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => JSON.parse(t)['@graph'] ?? [JSON.parse(t)]);
    const type = (t: string) => nodes.find((n: { '@type': string }) => n['@type'] === t);
    expect(type('Organization').name).toBe('City Royalty');
    expect(type('WebSite').potentialAction['@type']).toBe('SearchAction');
    const product = type('Product');
    expect(product.offers.priceCurrency).toBe('INR');
    expect(product.offers.lowPrice).toBe('13999.00');
    expect(product.offers.itemCondition).toBe('https://schema.org/NewCondition');
    expect(product.aggregateRating).toBeUndefined(); // never fabricate ratings
    expect(product.review).toBeUndefined();
    const crumbs = type('BreadcrumbList').itemListElement.map((i: { name: string }) => i.name);
    expect(crumbs).toEqual(['Home', 'Leather Jackets', "Men's Leather Jackets", 'Men’s Brown Leather Biker Jacket']);
    // this listing has no description, so no facts are shown or claimed
    await expect(page.getByRole('heading', { name: 'Key facts' })).toHaveCount(0);
    expect(product.material).toBeUndefined();
  });

  test('AEO: key facts come from the listing and match the structured data', async ({ page }) => {
    await page.goto('/products/black-mens-biker-leather-jacket');
    const facts = page.getByRole('region', { name: 'Key facts' });
    await expect(facts).toBeVisible();
    await expect(facts.getByText('Manufactured by Worldwide Artisans in India')).toBeVisible();
    await expect(facts.getByText('Full-grain leather')).toBeVisible();
    const nodes = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => JSON.parse(t)['@graph'] ?? [JSON.parse(t)]);
    const product = nodes.find((n: { '@type': string }) => n['@type'] === 'Product');
    expect(product.material).toBe('Full-grain leather');
    expect(product.countryOfOrigin.name).toBe('India');
  });

  test('legacy WooCommerce URLs 301 to the new routes', async ({ request }) => {
    const cases: [string, string][] = [
      ['/product/mens-brown-leather-biker-jacket/', '/products/mens-brown-leather-biker-jacket'],
      ['/product-category/jacket/mens-jacket/', '/collections/mens-jacket'],
      ['/product-category/belts/', '/collections/belts'],
      ['/shop/', '/collections/all'],
      ['/about-us-2/', '/pages/about'],
      ['/refund_returns/', '/pages/refund-and-returns'],
      ['/leather-care/', '/journal/leather-care'],
    ];
    for (const [from, to] of cases) {
      const first = await request.get(from, { maxRedirects: 0 });
      expect([301, 308], `${from} first hop`).toContain(first.status());
      const final = await request.get(from); // follow the chain (trailing-slash normalisation may add a hop)
      expect(new URL(final.url()).pathname, from).toBe(to);
      expect(final.status(), from).toBe(200);
    }
  });

  test('transactional pages are noindex; unknown routes show the branded 404', async ({ page }) => {
    for (const p of ['/cart', '/checkout', '/login', '/search?q=x']) {
      await page.goto(p);
      expect(await page.locator('meta[name=robots]').getAttribute('content'), p).toContain('noindex');
    }
    const res = await page.goto('/definitely-not-a-page');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('left the building');
  });

  test('imported brand pages render real content', async ({ page }) => {
    await page.goto('/pages/refund-and-returns');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Refund');
    expect((await page.locator('.prose-lux').innerText()).length).toBeGreaterThan(200);
    await page.goto('/journal/leather-care');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Leather Care/i);
  });
});
