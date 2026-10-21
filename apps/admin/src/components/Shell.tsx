'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role, UserDTO } from '@cityroyalty/shared';
import { call } from '@/lib/api';

const Ctx = createContext<{ user: UserDTO; logout: () => Promise<void> } | null>(null);
export const useStaff = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('outside shell');
  return c;
};

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: '/', label: 'Dashboard', roles: ['content', 'manager', 'admin'] },
  { href: '/products', label: 'Products', roles: ['content', 'manager', 'admin'] },
  { href: '/collections', label: 'Collections', roles: ['content', 'manager', 'admin'] },
  { href: '/inventory', label: 'Inventory', roles: ['manager', 'admin'] },
  { href: '/orders', label: 'Orders', roles: ['manager', 'admin'] },
  { href: '/returns', label: 'Returns', roles: ['manager', 'admin'] },
  { href: '/customers', label: 'Customers', roles: ['manager', 'admin'] },
  { href: '/discounts', label: 'Discounts', roles: ['manager', 'admin'] },
  { href: '/campaigns', label: 'Homepage', roles: ['content', 'manager', 'admin'] },
  { href: '/content', label: 'Journal & pages', roles: ['content', 'manager', 'admin'] },
  { href: '/subscribers', label: 'Subscribers', roles: ['manager', 'admin'] },
  { href: '/settings', label: 'Settings', roles: ['admin'] },
  { href: '/staff', label: 'Staff', roles: ['admin'] },
  { href: '/audit', label: 'Audit log', roles: ['admin'] },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const isLogin = path === '/login';

  useEffect(() => {
    if (isLogin) return setReady(true);
    call<{ user: UserDTO }>('/auth/me')
      .then((r) => {
        if (r.user.role === 'customer') throw new Error('not staff');
        setUser(r.user);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setReady(true));
  }, [isLogin, router, path === '/login']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setOpen(false), [path]);

  const logout = useCallback(async () => {
    await call('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  if (isLogin) return <>{children}</>;
  if (!ready || !user) return <div className="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>;
  const links = NAV.filter((n) => n.roles.includes(user.role));
  const allowed = links.some((l) => (l.href === '/' ? path === '/' : path.startsWith(l.href)));

  return (
    <Ctx.Provider value={{ user, logout }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className={`${open ? 'block' : 'hidden'} border-r border-line bg-royal text-ivory lg:block`}>
          <div className="flex items-center justify-between px-5 py-5">
            <p className="font-serif text-lg uppercase tracking-[0.22em]">City Royalty</p>
          </div>
          <nav aria-label="Admin" className="px-2 pb-6">
            <ul className="space-y-0.5">
              {links.map((l) => {
                const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
                return (<li key={l.href}><Link href={l.href} aria-current={active ? 'page' : undefined} className={`block px-3 py-2 text-sm ${active ? 'bg-ivory text-royal' : 'text-ivory/80 hover:bg-white/10'}`}>{l.label}</Link></li>);
              })}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:px-8">
            <button className="btn btn-ghost btn-sm lg:hidden" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Menu</button>
            <p className="hidden text-xs text-muted lg:block">Admin · {user.role}</p>
            <div className="flex items-center gap-4 text-sm"><span>{user.name}</span><button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button></div>
          </header>
          <main className="p-4 lg:p-8">{allowed ? children : <p role="alert">You don’t have access to this section.</p>}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
