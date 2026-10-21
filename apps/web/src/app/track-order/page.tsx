import type { Metadata } from 'next';
import { TrackOrder } from '@/components/checkout/TrackOrder';

export const metadata: Metadata = { title: 'Track your order', alternates: { canonical: '/track-order' } };
export default function Page() {
  return <TrackOrder />;
}
