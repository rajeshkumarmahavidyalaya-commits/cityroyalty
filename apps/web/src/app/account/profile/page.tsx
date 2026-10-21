import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { Profile } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'Profile', robots: { index: false } };
export default function Page() { return <AccountShell title="Profile"><Profile /></AccountShell>; }
