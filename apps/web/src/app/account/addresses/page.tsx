import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { Addresses } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'Addresses', robots: { index: false } };
export default function Page() { return <AccountShell title="Addresses"><Addresses /></AccountShell>; }
