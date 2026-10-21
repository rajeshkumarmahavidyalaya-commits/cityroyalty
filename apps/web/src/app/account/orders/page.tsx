import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { OrdersList } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'My orders', robots: { index: false } };
export default function Page() { return <AccountShell title="Orders"><OrdersList /></AccountShell>; }
