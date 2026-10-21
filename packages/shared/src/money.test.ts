import { describe, expect, it } from 'vitest';
import { formatMoney, percentOff, rupeesToPaise } from './money';
import { prettySize, slugify, sizeRank, stripHtml } from './text';
import { addressSchema, checkoutSchema } from './schemas';

describe('money', () => {
  it('formats whole and fractional rupees', () => {
    expect(formatMoney(1399900)).toBe('₹13,999');
    expect(formatMoney(129950)).toBe('₹1,299.50');
  });
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
  });
  it('computes percent off only for a higher compare-at', () => {
    expect(percentOff(799900, 1599900)).toBe(50);
    expect(percentOff(799900, 799900)).toBe(0);
    expect(percentOff(799900, null)).toBe(0);
  });
});

describe('text', () => {
  it('slugifies', () => {
    expect(slugify("Men’s Brown Leather Biker Jacket")).toBe('mens-brown-leather-biker-jacket');
    expect(slugify('Golden & White Bangle')).toBe('golden-and-white-bangle');
  });
  it('prettifies sizes and ranks them', () => {
    expect(prettySize('XL-48')).toBe('XL (48)');
    expect(prettySize('One Size')).toBe('One Size');
    expect(['XL-48', 'S-42', 'M-44'].sort((a, b) => sizeRank(a) - sizeRank(b))).toEqual(['S-42', 'M-44', 'XL-48']);
  });
  it('strips html', () => {
    expect(stripHtml('<p>Hello&nbsp;<b>world</b></p><script>x()</script>')).toBe('Hello world');
  });
});

describe('schemas', () => {
  const addr = { fullName: 'A B', phone: '98765 43210', line1: '12 Street', city: 'Delhi', state: 'Delhi', pin: '110001' };
  it('normalises phone and validates PIN', () => {
    expect(addressSchema.parse(addr).phone).toBe('9876543210');
    expect(() => addressSchema.parse({ ...addr, pin: '012345' })).toThrow();
    expect(() => addressSchema.parse({ ...addr, phone: '12345' })).toThrow();
  });
  it('requires an idempotency key and at least one line', () => {
    const base = { email: 'a@b.com', shippingAddress: addr, provider: 'mock' as const };
    expect(() => checkoutSchema.parse({ ...base, lines: [], idempotencyKey: 'x'.repeat(20) })).toThrow();
    expect(() =>
      checkoutSchema.parse({ ...base, lines: [{ productId: 'a'.repeat(24), variantId: 'b'.repeat(24), qty: 1 }], idempotencyKey: 'short' }),
    ).toThrow();
  });
});
