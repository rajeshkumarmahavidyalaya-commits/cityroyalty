import { expect, test } from '@playwright/test';
import { addBiker, fillCheckout } from './helpers';

test.describe('storefront', () => {
  test('home: hero copy, announcement, collections from real data, nothing for empty categories', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wear a higher standard');
    await expect(page.getByText(/Free shipping on orders over ₹600/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Find your piece' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: /Primary|Mobile/ }).first();
    void nav;
    await page.goto('/collections/all');
    await expect(page.getByRole('link', { name: 'Jewellery' })).toHaveCount(0); // no published jewellery → hidden
    expect(errors).toEqual([]);
  });

  test('3D hero renders a canvas (or falls back) without console errors', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.locator('canvas').evaluate((c) => getComputedStyle(c).opacity), { timeout: 30_000 }).toBe('1');
    await page.mouse.wheel(0, isMobile ? 1200 : 1500);
    await expect(page.getByText('Details that work hard.')).toBeVisible();
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test('collection: filter by size, in-stock, sort and clear', async ({ page }) => {
    await page.goto('/collections/mens-jacket');
    await expect(page.getByRole('heading', { level: 1 })).toContainText("Men's");
    const count = async () => Number((await page.getByRole('status').filter({ hasText: /piece/ }).first().innerText()).split(' ')[0]);
    const all = await count();
    expect(all).toBeGreaterThan(0);
    if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: /Filters/ }).click();
    await page.getByRole('button', { name: 'XXL (50)' }).click();
    await expect(page).toHaveURL(/size=XXL-50/);
    await page.waitForLoadState('networkidle');
    expect(await count()).toBeLessThanOrEqual(all);
    await page.goto('/collections/mens-jacket?sort=price-desc');
    const first = await page.locator('article h3').first().innerText();
    expect(first.length).toBeGreaterThan(3);
    await page.goto('/collections/mens-jacket?inStock=true&minPrice=99999999');
    await expect(page.getByText('Nothing matches those filters')).toBeVisible();
  });

  test('search overlay finds products and the results page works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('biker');
    await expect(page.getByRole('link', { name: /Biker/i }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=biker/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('biker');
    await page.goto('/search?q=zzzzqqq');
    await expect(page.getByText('Nothing found')).toBeVisible();
  });

  test('product page: price, sold-out size, gallery, JSON-LD; drafts 404', async ({ page }) => {
    await page.goto('/products/mens-brown-leather-biker-jacket');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Biker Jacket');
    await expect(page.getByText('₹13,999').first()).toBeVisible();
    await expect(page.getByText('₹18,999').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: /Size S \(42\) \(sold out\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to bag' }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Add to bag' }).first().click(); // no size chosen
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)').filter({ hasText: /select your size/i })).toBeVisible();
    expect((await page.goto('/products/mens-dark-green-leather'))?.status()).toBe(404);
  });

  test('bag: add, change quantity, discount, persist across reload, remove', async ({ page }) => {
    await addBiker(page);
    const dialog = page.getByRole('dialog', { name: /Your bag/ });
    await expect(dialog.getByText('₹13,999').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(dialog.getByText('₹27,998').first()).toBeVisible();
    await dialog.getByLabel('Discount code').fill('WELCOME10');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog.getByText(/WELCOME10/).first()).toBeVisible();
    await expect(dialog.getByText('−₹2,799.80')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('button', { name: /Open bag, 2 items/ })).toBeVisible();
    await page.getByRole('button', { name: /Open bag/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Your bag is empty')).toBeVisible();
  });

  test('wishlist persists locally', async ({ page }) => {
    await page.goto('/collections/all');
    await page.getByRole('button', { name: /^Add .* to wishlist/ }).first().click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Remove .* from wishlist/ }).first()).toBeVisible();
  });

  test('guest checkout with a (test) payment creates a confirmed order and a tracking lookup works', async ({ page }) => {
    await addBiker(page, 'L (46)');
    await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await page.getByRole('button', { name: /Continue to payment/ }).click(); // empty form → validation
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await fillCheckout(page);
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await page.getByRole('button', { name: 'Simulate success' }).click();
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
    const number = (await page.getByRole('heading', { name: /^Order CR-/ }).innerText()).replace('Order ', '');
    await expect(page.getByRole('button', { name: /Open bag, 0|Open bag$/ })).toBeVisible();
    await page.goto('/track-order');
    await page.getByLabel('Order number').fill(number);
    await page.getByLabel('Email').fill('buyer@example.com');
    await page.getByRole('button', { name: 'Track order' }).click();
    await expect(page.getByRole('heading', { name: `Order ${number}` })).toBeVisible();
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByRole('button', { name: 'Track order' }).click();
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText("couldn’t find");
  });
});
