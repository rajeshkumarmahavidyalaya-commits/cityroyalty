import type { PaymentProvider } from '@cityroyalty/shared';
import type { Config } from '../config';
import { badRequest } from '../lib/errors';
import { createMock } from './mock';
import { createRazorpay } from './razorpay';
import { createStripe } from './stripe';
import type { PaymentAdapter } from './types';

export type PaymentAdapters = Partial<Record<PaymentProvider, PaymentAdapter>>;

export function createPaymentAdapters(config: Config, fetchImpl?: typeof fetch): PaymentAdapters {
  const a: PaymentAdapters = {};
  if (config.providers.razorpay) a.razorpay = createRazorpay(config, fetchImpl);
  if (config.providers.stripe) a.stripe = createStripe(config, fetchImpl);
  if (config.providers.mock) a.mock = createMock(config);
  return a;
}

export function getAdapter(adapters: PaymentAdapters, provider: PaymentProvider): PaymentAdapter {
  const a = adapters[provider];
  if (!a) throw badRequest(`${provider} payments are not available`, undefined, 'provider_unavailable');
  return a;
}
export type { PaymentAdapter } from './types';
