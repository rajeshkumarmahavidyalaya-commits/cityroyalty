'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PricedCartDTO, ProductCardDTO, ProductDTO, UserDTO, VariantDTO } from '@cityroyalty/shared';
import { call } from './client-api';

/* ---------------------------------------------------------------- auth */
interface AuthState {
  user: UserDTO | null;
  ready: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserDTO>;
  signup: (name: string, email: string, password: string) => Promise<UserDTO>;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
};

/* ---------------------------------------------------------------- cart */
export interface CartLine {
  productId: string;
  variantId: string;
  qty: number;
}
interface CartState {
  lines: CartLine[];
  count: number;
  priced: PricedCartDTO | null;
  pricing: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (product: Pick<ProductDTO, 'id'>, variant: Pick<VariantDTO, 'id'>, qty?: number, opts?: { openDrawer?: boolean }) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  discountCode: string;
  applyCode: (code: string) => Promise<void>;
}
const CartCtx = createContext<CartState | null>(null);
export const useCart = () => {
  const c = useContext(CartCtx);
  if (!c) throw new Error('CartProvider missing');
  return c;
};

/* ---------------------------------------------------------------- wishlist */
interface WishState {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (p: Pick<ProductCardDTO, 'id'>) => void;
}
const WishCtx = createContext<WishState | null>(null);
export const useWishlist = () => {
  const c = useContext(WishCtx);
  if (!c) throw new Error('WishlistProvider missing');
  return c;
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / quota: the bag still works for this session */
  }
};

export function StoreProviders({ children }: { children: ReactNode }) {
  /* ---- auth ---- */
  const [user, setUser] = useState<UserDTO | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setUser((await call<{ user: UserDTO }>('/auth/me')).user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    // only ask when a session cookie could exist (the csrf cookie is readable, the session one is httpOnly)
    if (document.cookie.includes('cr_csrf=')) void refresh();
    else setReady(true);
  }, [refresh]);

  /* ---- cart ---- */
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [priced, setPriced] = useState<PricedCartDTO | null>(null);
  const [pricing, setPricing] = useState(false);
  const [open, setOpen] = useState(false);
  const [discountCode, setDiscountCode] = useState('');

  useEffect(() => {
    setLines(read<CartLine[]>('cr.cart.v1', []));
    setDiscountCode(read<string>('cr.code.v1', ''));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    write('cr.cart.v1', lines);
    write('cr.code.v1', discountCode);
  }, [lines, discountCode, hydrated]);

  // server is the pricing authority: re-price whenever the bag changes
  const seq = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    if (!lines.length) {
      setPriced(null);
      return;
    }
    const id = ++seq.current;
    setPricing(true);
    const t = setTimeout(async () => {
      try {
        const p = await call<PricedCartDTO>('/cart/price', { body: { lines, discountCode: discountCode || undefined } });
        if (id !== seq.current) return;
        setPriced(p);
        // drop lines that no longer exist, clamp quantities to what is available
        const fixed = lines
          .filter((l) => !p.lines.some((x) => x.variantId === l.variantId && x.issue === 'removed'))
          .map((l) => {
            const pl = p.lines.find((x) => x.variantId === l.variantId);
            return pl && pl.maxQty != null && pl.maxQty > 0 && l.qty > pl.maxQty ? { ...l, qty: pl.maxQty } : l;
          });
        if (JSON.stringify(fixed) !== JSON.stringify(lines)) setLines(fixed);
      } catch {
        /* offline: keep the last priced snapshot */
      } finally {
        if (id === seq.current) setPricing(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [lines, discountCode, hydrated]);

  // merge with the server bag on login, then keep it in sync
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !user || synced.current === user.id) return;
    synced.current = user.id;
    (async () => {
      try {
        const remote = await call<{ lines: CartLine[] }>('/me/cart');
        const merged = new Map<string, CartLine>();
        for (const l of [...remote.lines, ...lines]) {
          const cur = merged.get(l.variantId);
          merged.set(l.variantId, cur ? { ...cur, qty: Math.min(10, Math.max(cur.qty, l.qty)) } : l);
        }
        setLines([...merged.values()]);
      } catch {
        /* ignore */
      }
    })();
  }, [user, hydrated, lines]);
  useEffect(() => {
    if (!user || !hydrated || synced.current !== user.id) return;
    const t = setTimeout(() => void call('/me/cart', { method: 'PUT', body: { lines } }).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [lines, user, hydrated]);

  const add: CartState['add'] = useCallback((product, variant, qty = 1, opts) => {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.variantId === variant.id);
      if (i >= 0) return cur.map((l, j) => (j === i ? { ...l, qty: Math.min(10, l.qty + qty) } : l));
      return [...cur, { productId: product.id, variantId: variant.id, qty }];
    });
    if (opts?.openDrawer !== false) setOpen(true);
  }, []);
  const setQty = useCallback((variantId: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((l) => l.variantId !== variantId) : cur.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(10, qty) } : l)))), []);
  const remove = useCallback((variantId: string) => setLines((cur) => cur.filter((l) => l.variantId !== variantId)), []);
  const clear = useCallback(() => {
    setLines([]);
    setDiscountCode('');
  }, []);
  const applyCode = useCallback(async (code: string) => {
    setDiscountCode(code.trim().toUpperCase());
  }, []);

  /* ---- wishlist ---- */
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds(read<string[]>('cr.wish.v1', [])), []);
  const wishSynced = useRef<string | null>(null);
  useEffect(() => {
    if (!user || wishSynced.current === user.id) return;
    wishSynced.current = user.id;
    call<{ ids: string[] }>('/me/wishlist')
      .then((r) => {
        const merged = [...new Set([...r.ids, ...read<string[]>('cr.wish.v1', [])])];
        setIds(merged);
        write('cr.wish.v1', merged);
        return call('/me/wishlist', { method: 'PUT', body: { ids: merged } });
      })
      .catch(() => undefined);
  }, [user]);
  const toggle: WishState['toggle'] = useCallback(
    (p) => {
      setIds((cur) => {
        const next = cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id];
        write('cr.wish.v1', next);
        if (user) void call('/me/wishlist', { method: 'PUT', body: { ids: next } }).catch(() => undefined);
        return next;
      });
    },
    [user],
  );

  const auth = useMemo<AuthState>(
    () => ({
      user,
      ready,
      refresh,
      login: async (email, password) => {
        const r = await call<{ user: UserDTO }>('/auth/login', { body: { email, password } });
        setUser(r.user);
        return r.user;
      },
      signup: async (name, email, password) => {
        const r = await call<{ user: UserDTO }>('/auth/signup', { body: { name, email, password } });
        setUser(r.user);
        return r.user;
      },
      logout: async () => {
        await call('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
        synced.current = null;
        wishSynced.current = null;
        setUser(null);
      },
    }),
    [user, ready, refresh],
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const cart = useMemo<CartState>(
    () => ({ lines, count, priced, pricing, open, setOpen, add, setQty, remove, clear, discountCode, applyCode }),
    [lines, count, priced, pricing, open, add, setQty, remove, clear, discountCode, applyCode],
  );
  const wish = useMemo<WishState>(() => ({ ids, has: (id) => ids.includes(id), toggle }), [ids, toggle]);

  return (
    <AuthCtx.Provider value={auth}>
      <CartCtx.Provider value={cart}>
        <WishCtx.Provider value={wish}>{children}</WishCtx.Provider>
      </CartCtx.Provider>
    </AuthCtx.Provider>
  );
}
