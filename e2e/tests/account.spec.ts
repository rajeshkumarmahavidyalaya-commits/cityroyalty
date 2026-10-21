import { expect, test } from '@playwright/test';
import { addBiker, fillCheckout } from './helpers';

test('guests are sent to sign in; customers can sign up, order, manage addresses and sign out', async ({ page }) => {
  await page.goto('/account/orders');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('Email').fill(`cust${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.locator('[role=alert]:not(#__next-route-announcer__)').first()).toBeVisible();
  await page.getByLabel('Password').fill('Sup3rsecret-pass');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(/Welcome back, Test/)).toBeVisible();

  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add an address' }).click();
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('Address', { exact: true }).fill('7 Lake View');
  await page.getByLabel('City', { exact: true }).fill('Pune');
  await page.getByLabel('PIN code').fill('411001');
  await page.getByLabel('State').selectOption('Maharashtra');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('7 Lake View')).toBeVisible();

  await addBiker(page, 'M (44)');
  await page.getByRole('dialog').getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Pune'); // prefilled from the address book
  await page.getByRole('button', { name: /Continue to payment/ }).click();
  await page.getByRole('button', { name: 'Simulate success' }).click();
  await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible();
  await page.goto('/account/orders');
  await expect(page.getByRole('link', { name: /CR-/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
  void fillCheckout;
});

test('login rejects a wrong password without revealing which part was wrong', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('customer@e2e.test');
  await page.getByLabel('Password').fill('not-the-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toHaveText('Incorrect email or password');
});
