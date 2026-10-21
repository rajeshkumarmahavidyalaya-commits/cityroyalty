import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { ADMIN, adminLogin, addBiker, fillCheckout } from './helpers';

test.describe('admin', () => {
  test('customers cannot sign in; content editors cannot see orders or settings', async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel('Email').fill('customer@e2e.test');
    await page.getByLabel('Password').fill('E2e-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText('does not have admin access');
    await adminLogin(page, 'content@e2e.test');
    await expect(page.getByRole('link', { name: 'Products', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Orders' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await page.goto(`${ADMIN}/orders`);
    await expect(page.getByText('You don’t have access to this section.')).toBeVisible();
  });

  test('product workflow: draft → blockers → photo → review → publish → visible on storefront', async ({ page, browser }, info) => {
    await adminLogin(page, 'manager@e2e.test');
    await page.goto(`${ADMIN}/products/new`);
    await page.getByLabel('Title', { exact: true }).fill('E2E Heritage Satchel');
    await page.getByLabel('SKU', { exact: true }).fill('E2E-1');
    await page.getByLabel('Description', { exact: true }).fill('A test product created by the end-to-end suite.');
    await page.getByLabel('Option names (comma separated)').fill('Color');
    await page.getByLabel('Variant SKU').fill('E2E-1-TAN');
    await page.getByLabel('Color', { exact: true }).fill('Tan');
    await page.getByLabel('Price in rupees').fill('4999');
    await page.getByRole('checkbox', { name: 'Leather Bags' }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/products\/[a-f0-9]{24}$/);
    await expect(page.getByText('No product photograph')).toBeVisible();
    await expect(page.getByText('Stock not entered')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send to review' })).toBeDisabled();

    await page.getByLabel('Stock', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const png = path.join(info.outputPath('e2e.png'));
    await sharp({ create: { width: 900, height: 1100, channels: 3, background: '#8B5E3C' } }).png().toFile(png);
    await page.getByLabel(/Image file/).setInputFiles(png);
    await page.getByLabel('Kind').selectOption('concept');
    await page.getByLabel('Alt text', { exact: true }).fill('Concept render');
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText(/uploaded and optimised/)).toBeVisible();
    await expect(page.getByText(/Only concept images/)).toBeVisible(); // concept art does not unlock publishing

    await page.getByLabel(/Image file/).setInputFiles(png);
    await page.getByLabel('Kind').selectOption('photo');
    await page.getByLabel('Alt text', { exact: true }).fill('Tan satchel, front');
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('All publication checks pass.')).toBeVisible();
    await page.getByRole('button', { name: 'Send to review' }).click();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Status: published')).toBeVisible();

    // storefront (separate anonymous visitor) can now see it — and only the photograph, never the concept image
    const visitor = await (await browser.newContext()).newPage();
    await expect.poll(async () => (await visitor.goto('http://localhost:3100/products/e2e-heritage-satchel'))?.status(), { timeout: 20_000 }).toBe(200);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('E2E Heritage Satchel');
    await expect(visitor.locator('img[alt="Concept render"]')).toHaveCount(0);
    await expect(visitor.getByText('₹4,999').first()).toBeVisible();
  });

  test('order fulfilment: ship with tracking, customer sees it; inventory edit; discount creation; audit trail', async ({ page, browser }) => {
    const shop = await (await browser.newContext()).newPage();
    await addBiker(shop, 'XXL (50)');
    await shop.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click();
    await fillCheckout(shop, 'fulfil@example.com');
    await shop.getByRole('button', { name: /Continue to payment/ }).click();
    await shop.getByRole('button', { name: 'Simulate success' }).click();
    await expect(shop.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
    const number = (await shop.getByRole('heading', { name: /^Order CR-/ }).innerText()).replace('Order ', '');

    await adminLogin(page, 'manager@e2e.test');
    await page.goto(`${ADMIN}/orders`);
    await page.getByRole('link', { name: number }).click();
    await page.getByLabel('Carrier').fill('Delhivery');
    await page.getByLabel('Tracking number').fill('DL99887766');
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(page.getByText('Shipment added; customer notified.')).toBeVisible();
    await page.getByRole('button', { name: 'Mark delivered' }).click();
    await expect(page.getByText('Order delivered.')).toBeVisible();

    await shop.goto('/track-order');
    await shop.getByLabel('Order number').fill(number);
    await shop.getByLabel('Email').fill('fulfil@example.com');
    await shop.getByRole('button', { name: 'Track order' }).click();
    await expect(shop.getByText('Delhivery · DL99887766')).toBeVisible();

    await page.goto(`${ADMIN}/inventory`);
    await page.getByRole('searchbox').or(page.getByLabel('Search inventory')).fill('CRBLMGN03');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByLabel(/Stock for CRBLMGN03/).first().fill('42');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByText(/Updated CRBLMGN03/)).toBeVisible();

    await page.goto(`${ADMIN}/discounts`);
    await page.getByLabel('Code').fill('E2E15');
    await page.getByLabel(/Percent \(1–90\)/).fill('15');
    await page.getByRole('button', { name: 'Create code' }).click();
    await expect(page.getByText('Discount created.')).toBeVisible();

    const admin = await (await browser.newContext()).newPage();
    await adminLogin(admin, 'admin@e2e.test');
    await admin.goto(`${ADMIN}/audit`);
    await expect(admin.getByText('order.ship')).toBeVisible();
    await expect(admin.getByText('inventory.adjust')).toBeVisible();
  });

  test('settings: admin only, blank unconfirmed values stay blank', async ({ page }) => {
    await adminLogin(page, 'admin@e2e.test');
    await page.goto(`${ADMIN}/settings`);
    await expect(page.getByLabel('Return window (days)')).toHaveValue('');
    await page.getByLabel('Returns summary (product pages)').fill('Returns accepted per the policy page.');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText(/Settings saved/)).toBeVisible();
  });
});
