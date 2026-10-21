import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { Overview } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };
export default function Page() { return <AccountShell title="Overview"><Overview /></AccountShell>; }
