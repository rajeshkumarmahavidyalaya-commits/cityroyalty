import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { OrderView } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <AccountShell title="Order"><OrderView number={number} /></AccountShell>;
}
