import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';
import { WishlistPage } from '@/components/account/AccountPages';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false } };
export default function Page() { return <AccountShell title="Wishlist"><WishlistPage /></AccountShell>; }
