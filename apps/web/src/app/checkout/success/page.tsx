import type { Metadata } from 'next';
import { OrderResult } from '@/components/checkout/OrderResult';

export const metadata: Metadata = { title: 'Order confirmed', robots: { index: false } };
export default function Page() {
  return <OrderResult kind="success" />;
}
