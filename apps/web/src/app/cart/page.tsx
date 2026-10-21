import type { Metadata } from 'next';
import { CartPageView } from '@/components/checkout/CartPageView';

export const metadata: Metadata = { title: 'Your bag', robots: { index: false } };
export default function CartPage() {
  return <CartPageView />;
}
