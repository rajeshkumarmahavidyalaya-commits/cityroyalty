import { eq, inArray } from 'drizzle-orm';
import { MAX_QTY_PER_LINE, prettySize, type CartInput, type PricedCartDTO, type PricedLineDTO, type SettingsInput } from '@cityroyalty/shared';
import { db } from '../db';
import { discounts, products, type DiscountRow, type VariantRow } from '../db/schema';
import { publicImages } from './catalog';
import { hydrate } from './products';

export interface ResolvedLine {
  productId: string;
  variantId: string;
  qty: number;
  title: string;
  slug: string;
  sku: string;
  optionsLabel: string;
  image: string | undefined;
  unitPrice: number;
  madeToOrder: boolean;
}

export interface PricingResult {
  priced: PricedCartDTO;
  resolved: ResolvedLine[];
  discountRow: DiscountRow | null;
  codFee: number;
}

const labelFor = (v: VariantRow): string =>
  Object.entries(v.options)
    .map(([k, val]) => (/^size$/i.test(k) ? prettySize(val) : val))
    .join(' · ');

export function validateDiscount(d: DiscountRow | null | undefined, subtotal: number, now = new Date()): string | null {
  if (!d || !d.active) return 'That code is not valid';
  if (d.startsAt && d.startsAt > now) return 'That code is not active yet';
  if (d.endsAt && d.endsAt < now) return 'That code has expired';
  if (d.maxUses != null && d.usedCount >= d.maxUses) return 'That code has been fully redeemed';
  if (subtotal < d.minSubtotal) return 'Spend a little more to use this code (minimum applies)';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function priceCart(input: Pick<CartInput, 'lines' | 'discountCode'>, settings: SettingsInput, opts: { cod?: boolean } = {}): Promise<PricingResult> {
  const merged = new Map<string, { productId: string; variantId: string; qty: number }>();
  for (const l of input.lines) {
    const cur = merged.get(l.variantId);
    if (cur) cur.qty += l.qty;
    else merged.set(l.variantId, { productId: l.productId, variantId: l.variantId, qty: l.qty });
  }
  const wanted = [...merged.values()];
  const ids = [...new Set(wanted.map((w) => w.productId).filter((x) => UUID.test(x)))];
  const rows = ids.length ? await db().select().from(products).where(inArray(products.id, ids)) : [];
  const full = await hydrate(rows.filter((r) => r.status === 'published'));
  const byId = new Map(full.map((p) => [p.id, p]));

  const lines: PricedLineDTO[] = [];
  const resolved: ResolvedLine[] = [];
  let ok = wanted.length > 0;

  for (const w of wanted) {
    const p = byId.get(w.productId);
    const v = p?.variants.find((x) => x.id === w.variantId && x.active);
    if (!p || !v || !(v.price > 0)) {
      ok = false;
      lines.push({
        productId: w.productId, variantId: w.variantId, qty: w.qty, title: p?.title ?? 'Unavailable item', slug: p?.slug ?? '', sku: v?.sku ?? '',
        optionsLabel: '', image: null, unitPrice: 0, compareAt: null, lineTotal: 0, maxQty: 0, issue: p ? 'unavailable' : 'removed',
      });
      continue;
    }
    const cap = v.madeToOrder ? null : (v.stock ?? 0);
    const qty = Math.min(w.qty, MAX_QTY_PER_LINE);
    const issue: PricedLineDTO['issue'] = cap !== null && cap <= 0 ? 'unavailable' : cap !== null && qty > cap ? 'insufficient_stock' : undefined;
    if (issue) ok = false;
    const img = publicImages(p)[0] ?? null;
    lines.push({
      productId: w.productId, variantId: w.variantId, qty, title: p.title, slug: p.slug, sku: v.sku, optionsLabel: labelFor(v), image: img,
      unitPrice: v.price, compareAt: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null, lineTotal: v.price * qty,
      maxQty: cap === null ? MAX_QTY_PER_LINE : Math.min(cap, MAX_QTY_PER_LINE), issue,
    });
    resolved.push({
      productId: w.productId, variantId: w.variantId, qty, title: p.title, slug: p.slug, sku: v.sku, optionsLabel: labelFor(v),
      image: img ? (img.webp.find((s) => s.w >= 320)?.url ?? img.src) : undefined, unitPrice: v.price, madeToOrder: v.madeToOrder,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let discount: PricedCartDTO['discount'] = null;
  let discountError: string | undefined;
  let discountRow: DiscountRow | null = null;
  let freeShip = false;
  const code = input.discountCode?.trim().toUpperCase();
  if (code) {
    const [d] = await db().select().from(discounts).where(eq(discounts.code, code));
    discountError = validateDiscount(d, subtotal) ?? undefined;
    if (!discountError && d) {
      discountRow = d;
      let amount = 0;
      let description = '';
      if (d.type === 'percent') {
        amount = Math.floor((subtotal * d.value) / 100);
        description = `${d.value}% off`;
      } else if (d.type === 'fixed') {
        amount = Math.min(d.value, subtotal);
        description = 'Discount';
      } else {
        freeShip = true;
        description = 'Free shipping';
      }
      discount = { code: d.code, amount, description };
    }
  }
  const discountAmount = discount?.amount ?? 0;

  let shipping: number | null;
  let shippingNote: string | undefined;
  const { freeThreshold, flatRate } = settings.shipping;
  if (!lines.length) shipping = 0;
  else if (freeShip || (freeThreshold != null && subtotal >= freeThreshold)) shipping = 0;
  else if (flatRate != null) shipping = flatRate;
  else {
    shipping = null;
    shippingNote = 'Shipping for this order value is being confirmed';
  }

  const codFee = opts.cod ? settings.shipping.codFee : 0;
  const total = shipping == null ? null : subtotal - discountAmount + shipping + codFee;
  return {
    priced: { lines, subtotal, discount, discountError, shipping, shippingNote, total, currency: 'INR', ok: ok && shipping != null },
    resolved,
    discountRow,
    codFee,
  };
}
