import type { Metadata } from 'next';
import { OrderResult } from '@/components/checkout/OrderResult';

export const metadata: Metadata = { title: 'Payment not completed', robots: { index: false } };
export default function Page() {
  return <OrderResult kind="failed" />;
}
