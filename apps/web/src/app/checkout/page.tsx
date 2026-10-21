import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { api } from '@/lib/api';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  return <CheckoutView settings={await api.settings()} />;
}
