import { type SettingsInput } from '@cityroyalty/shared';
import { Setting } from '../models';

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
  const doc = await Setting.findOne({ key: KEY }).lean();
  return { ...DEFAULT_SETTINGS, ...((doc?.value as Partial<SettingsInput>) ?? {}) } as SettingsInput;
}
export async function saveSettings(value: SettingsInput) {
  await Setting.updateOne({ key: KEY }, { $set: { value } }, { upsert: true });
  return value;
}
