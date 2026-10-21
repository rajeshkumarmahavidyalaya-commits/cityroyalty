import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN, addBiker } from './helpers';

const scan = async (page: import('@playwright/test').Page, name: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).exclude('canvas').analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${name}: ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), name).toEqual([]);
};

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  for (const [name, url] of [['home', '/'], ['collection', '/collections/mens-jacket'], ['product', '/products/mens-brown-leather-biker-jacket'], ['search', '/search?q=belt'], ['login', '/login'], ['track', '/track-order'], ['journal', '/journal'], ['info', '/pages/faqs']] as const) {
    test(name, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await scan(page, name);
    });
  }
  test('cart drawer + checkout', async ({ page }) => {
    await addBiker(page);
    await scan(page, 'cart drawer');
    await page.keyboard.press('Escape');
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    await scan(page, 'checkout');
  });
  test('keyboard: drawer traps focus and Escape closes it, restoring focus', async ({ page }) => {
    await page.goto('/');
    const bag = page.getByRole('button', { name: /Open bag/ });
    await bag.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Your bag/ });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(bag).toBeFocused();
  });
  test('admin login', async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await scan(page, 'admin login');
  });
});
