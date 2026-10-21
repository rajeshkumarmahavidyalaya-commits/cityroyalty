import { MAX_QTY_PER_LINE, prettySize, type CartInput, type PricedCartDTO, type PricedLineDTO, type SettingsInput } from '@cityroyalty/shared';
import { Discount, Product, type DiscountDoc, type ProductDoc } from '../models';
import { publicImages, toImage } from './catalog';

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
  discountDoc: (DiscountDoc & { _id: unknown }) | null;
  codFee: number;
}

type Variant = ProductDoc['variants'][number] & { _id: unknown };

const labelFor = (v: Variant): string => {
  const o = v.options instanceof Map ? Object.fromEntries(v.options) : ((v.options as unknown as Record<string, string>) ?? {});
  return Object.entries(o)
    .map(([k, val]) => (/^size$/i.test(k) ? prettySize(val) : val))
    .join(' · ');
};

export function validateDiscount(d: (DiscountDoc & { _id: unknown }) | null, subtotal: number, now = new Date()): string | null {
  if (!d || !d.active) return 'That code is not valid';
  if (d.startsAt && d.startsAt > now) return 'That code is not active yet';
  if (d.endsAt && d.endsAt < now) return 'That code has expired';
  if (d.maxUses != null && d.usedCount >= d.maxUses) return 'That code has been fully redeemed';
  if (subtotal < d.minSubtotal) return `Spend a little more to use this code (minimum applies)`;
  return null;
}

export async function priceCart(
  input: Pick<CartInput, 'lines' | 'discountCode'>,
  settings: SettingsInput,
  opts: { cod?: boolean } = {},
): Promise<PricingResult> {
  // merge duplicate variants
  const merged = new Map<string, { productId: string; variantId: string; qty: number }>();
  for (const l of input.lines) {
    const k = l.variantId;
    const cur = merged.get(k);
    if (cur) cur.qty += l.qty;
    else merged.set(k, { productId: l.productId, variantId: l.variantId, qty: l.qty });
  }
  const wanted = [...merged.values()];
  const products = await Product.find({ _id: { $in: wanted.map((w) => w.productId) }, status: 'published' }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines: PricedLineDTO[] = [];
  const resolved: ResolvedLine[] = [];
  let ok = wanted.length > 0;

  for (const w of wanted) {
    const p = byId.get(w.productId);
    const v = p?.variants.find((x) => String(x._id) === w.variantId && x.active) as Variant | undefined;
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
      productId: w.productId, variantId: w.variantId, qty, title: p.title, slug: p.slug, sku: v.sku, optionsLabel: labelFor(v),
      image: img, unitPrice: v.price, compareAt: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null,
      lineTotal: v.price * qty, maxQty: cap === null ? MAX_QTY_PER_LINE : Math.min(cap, MAX_QTY_PER_LINE), issue,
    });
    resolved.push({
      productId: w.productId, variantId: w.variantId, qty, title: p.title, slug: p.slug, sku: v.sku, optionsLabel: labelFor(v),
      image: img ? (img.webp.find((s) => s.w >= 320)?.url ?? img.src) : undefined, unitPrice: v.price, madeToOrder: v.madeToOrder,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  // discount
  let discount: PricedCartDTO['discount'] = null;
  let discountError: string | undefined;
  let discountDoc: PricingResult['discountDoc'] = null;
  let freeShip = false;
  const code = input.discountCode?.trim().toUpperCase();
  if (code) {
    const d = (await Discount.findOne({ code }).lean()) as (DiscountDoc & { _id: unknown }) | null;
    discountError = validateDiscount(d, subtotal) ?? undefined;
    if (!discountError && d) {
      discountDoc = d;
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

  // shipping
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
    discountDoc,
    codFee,
  };
}

export { toImage };
