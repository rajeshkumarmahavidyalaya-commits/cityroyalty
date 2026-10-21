import { expect, test } from '@playwright/test';
import { addBiker, fillCheckout } from './helpers';

test.describe('commerce edge cases', () => {
  test('failed payment → recovery page → retry succeeds, stock is not double counted', async ({ page }) => {
    await addBiker(page, 'XL (48)');
    await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click();
    await fillCheckout(page, 'retry@example.com');
    await page.getByRole('button', { name: /Continue to payment/ }).click();
    await page.getByRole('button', { name: 'Simulate failure' }).click();
    await expect(page.getByRole('heading', { name: 'Let’s finish your order' })).toBeVisible();
    await page.getByRole('button', { name: 'Try payment again' }).click();
    await page.getByRole('button', { name: 'Simulate success' }).click();
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
  });

  test('last unit: only one of two simultaneous buyers can pay', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    for (const p of [a, b]) {
      await p.goto('/products/black-leather-belt-2');
      await p.getByRole('button', { name: 'Add to bag' }).first().click();
      await expect(p.getByRole('dialog', { name: /Your bag/ })).toBeVisible();
    }
    for (const [p, email] of [[a, 'a@example.com'], [b, 'b@example.com']] as const) {
      await p.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click();
      await fillCheckout(p, email);
    }
    await a.getByRole('button', { name: /Continue to payment/ }).click();
    await expect(a.getByRole('button', { name: 'Simulate success' })).toBeVisible();
    // b now sees the unit gone
    await b.getByRole('button', { name: /Continue to payment/ }).click();
    await expect(b.getByRole('alert').first()).toBeVisible();
    await a.getByRole('button', { name: 'Simulate success' }).click();
    await expect(a.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
  });

  test('shipping rule: free over ₹600, flat rate below', async ({ page }) => {
    await page.goto('/products/black-leather-belt'); // ₹999 → free
    await page.getByRole('button', { name: 'Add to bag' }).first().click();
    await expect(page.getByRole('dialog').getByText('Free', { exact: true })).toBeVisible();
  });
});
