import { expect, type Page } from '@playwright/test';

export const ADMIN = 'http://localhost:3101';
export const PW = 'E2e-password-1';

export async function addBiker(page: Page, size = 'M (44)') {
  await page.goto('/products/mens-brown-leather-biker-jacket');
  await page.getByRole('radio', { name: new RegExp(`^Size ${size.replace(/[()]/g, '\\$&')}`) }).click();
  await page.getByRole('button', { name: 'Add to bag' }).first().click();
  await expect(page.getByRole('dialog', { name: /Your bag/ })).toBeVisible();
}

export async function fillCheckout(page: Page, email = 'buyer@example.com') {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Full name').fill('Asha Verma');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByLabel('PIN code').fill('560001');
  await page.getByLabel('Address', { exact: true }).fill('12 MG Road');
  await page.getByLabel('City', { exact: true }).fill('Bengaluru');
  await page.getByLabel('State').selectOption('Karnataka');
}

export async function adminLogin(page: Page, email: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${ADMIN}/`);
}
