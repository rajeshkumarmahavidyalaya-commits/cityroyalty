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
  });

  test('product page metadata, canonical, JSON-LD and breadcrumbs', async ({ page }) => {
    await page.goto('/products/mens-brown-leather-biker-jacket');
    await expect(page).toHaveTitle(/Biker Jacket \| City Royalty/);
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toMatch(/\/products\/mens-brown-leather-biker-jacket$/);
    expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toContain('Biker');
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    const product = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'Product');
    expect(product.offers.priceCurrency).toBe('INR');
    expect(product.offers.lowPrice).toBe('13999.00');
    expect(product.aggregateRating).toBeUndefined(); // never fabricate ratings
    expect(ld['@graph'].some((n: { '@type': string }) => n['@type'] === 'BreadcrumbList')).toBe(true);
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
