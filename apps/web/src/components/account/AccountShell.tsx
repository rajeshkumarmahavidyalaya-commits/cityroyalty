'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/store';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/profile', label: 'Profile' },
];

export function AccountShell({ children, title }: { children: ReactNode; title: string }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [ready, user, router, path]);
  if (!ready || !user) return <div className="container-x py-24"><div className="skeleton h-32 max-w-lg" aria-busy /></div>;
  return (
    <div className="container-x py-10 md:py-16">
      <p className="eyebrow text-tan">My account</p>
      <h1 className="mt-2 text-4xl md:text-6xl">{title}</h1>
      <div className="mt-10 grid gap-10 md:grid-cols-[13rem_1fr] md:gap-16">
        <nav aria-label="Account" className="flex gap-5 overflow-x-auto md:flex-col md:gap-1">
          {LINKS.map((l) => (<Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined} className={`whitespace-nowrap py-2 text-sm ${path === l.href ? 'border-b border-royal md:border-b-0 md:font-semibold' : 'text-muted hover:text-royal'}`}>{l.label}</Link>))}
          <button type="button" className="py-2 text-left text-sm text-muted hover:text-royal" onClick={async () => { await logout(); router.push('/'); }}>Sign out</button>
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
