'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { BagIcon, HeartIcon, MenuIcon, SearchIcon, UserIcon } from '../ui/Icons';
import { useAuth, useCart, useWishlist } from '@/lib/store';
import { SearchPanel } from './SearchPanel';

import type { NavItem } from '@/lib/nav';
export type { NavItem };

export function Header({ nav, announcement }: { nav: NavItem[]; announcement?: string }) {
  const path = usePathname();
  const router = useRouter();
  const { count, setOpen } = useCart();
  const { ids } = useWishlist();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const last = useRef(0);
  const overlay = path === '/';

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 24);
        setHidden(y > 240 && y > last.current + 4 ? true : y < last.current - 4 ? false : hidden);
        last.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setMenu(false), [path]);

  const solid = scrolled || !overlay || menu;
  const tone = solid ? 'text-royal' : 'text-ivory';

  return (
    <>
      {announcement && (
        <div className="bg-royal px-4 py-2 text-center text-ivory">
          <p className="eyebrow !tracking-[0.18em]">{announcement}</p>
        </div>
      )}
      <header
        className={`sticky inset-x-0 top-0 z-50 transition-[transform,background-color,box-shadow] duration-500 ease-[var(--ease-lux)] ${hidden && !menu ? '-translate-y-full' : 'translate-y-0'} ${solid ? 'bg-ivory/95 shadow-[0_1px_0_var(--color-line)] backdrop-blur' : 'bg-transparent'} ${tone}`}
      >
        <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 md:h-20">
          <div className="flex items-center gap-6">
            <button type="button" className="-ml-2 p-2 lg:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
              <MenuIcon />
            </button>
            <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
              {nav.slice(0, 4).map((n) => (
                <Link key={n.href} href={n.href} className={`eyebrow link-u whitespace-nowrap py-1 ${path === n.href ? 'opacity-100' : 'opacity-90'}`} aria-current={path === n.href ? 'page' : undefined}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link href="/" aria-label="City Royalty — home" className="text-center font-serif text-[1.35rem] uppercase leading-none tracking-[0.28em] md:text-[1.7rem]">
            City Royalty
          </Link>
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button type="button" className="p-2" aria-label="Search" onClick={() => setSearch(true)}>
              <SearchIcon />
            </button>
            <Link href={user ? '/account' : '/login'} className="hidden p-2 sm:block" aria-label={user ? 'My account' : 'Sign in'}>
              <UserIcon />
            </Link>
            <Link href="/account/wishlist" className="relative hidden p-2 sm:block" aria-label={`Wishlist${ids.length ? `, ${ids.length} items` : ''}`}>
              <HeartIcon filled={false} />
              {ids.length > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-tan" />}
            </Link>
            <button type="button" className="relative p-2" aria-label={`Open bag, ${count} item${count === 1 ? '' : 's'}`} onClick={() => setOpen(true)}>
              <BagIcon />
              {count > 0 && (
                <span className="absolute -right-0.5 top-0 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-royal px-1 text-[0.625rem] font-semibold leading-none text-ivory ring-1 ring-ivory">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <Drawer open={menu} onClose={() => setMenu(false)} title="Menu" side="left" width="min(24rem, 100vw)">
        <nav aria-label="Mobile" className="flex flex-1 flex-col overflow-y-auto px-6 py-8">
          <ul className="space-y-1">
            {nav.map((n, i) => (
              <li key={n.href} style={{ animation: `fade-up .5s ${0.05 + i * 0.05}s both var(--ease-lux)` }}>
                <Link href={n.href} className="block border-b border-line py-4 font-serif text-3xl" onClick={() => setMenu(false)}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-auto space-y-3 pt-10 text-sm">
            <li><Link href={user ? '/account' : '/login'} onClick={() => setMenu(false)}>{user ? 'My account' : 'Sign in / Create account'}</Link></li>
            <li><Link href="/account/wishlist" onClick={() => setMenu(false)}>Wishlist{ids.length ? ` (${ids.length})` : ''}</Link></li>
            <li><Link href="/track-order" onClick={() => setMenu(false)}>Track an order</Link></li>
          </ul>
        </nav>
      </Drawer>

      <Drawer open={search} onClose={() => setSearch(false)} title="Search" side="top" hideTitle>
        <SearchPanel
          onNavigate={(href) => {
            setSearch(false);
            router.push(href);
          }}
        />
      </Drawer>
    </>
  );
}
