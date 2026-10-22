import { type SettingsInput } from '@cityroyalty/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../db/schema';

/**
 * Defaults contain only facts published on cityroyalty.in. Values the merchant has not confirmed
 * (flat shipping rate, return window, tax treatment) are null/false so nothing is invented.
 */
export const DEFAULT_SETTINGS: SettingsInput = {
  storeName: 'City Royalty',
  social: { instagram: 'https://www.instagram.com/cityroyalty.official', facebook: 'https://www.facebook.com/CITYROYALTY' },
  shipping: { freeThreshold: 60000, flatRate: null, codEnabled: false, codFee: 0 },
  tax: { pricesIncludeTax: false },
  returns: { windowDays: null },
  brandFacts: ['Established 2018', 'Free shipping on orders over ₹600', 'Support available 24/7'],
};

const KEY = 'site';
export async function getSettings(): Promise<SettingsInput> {
  const [row] = await db().select().from(settings).where(eq(settings.key, KEY));
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<SettingsInput>) ?? {}) } as SettingsInput;
}
export async function saveSettings(value: SettingsInput) {
  await db().insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return value;
}
