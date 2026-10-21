import { describe, expect, it } from 'vitest';
import type { CollectionDTO } from '@cityroyalty/shared';
import { swatchColour } from './format';
import { navFromCollections } from './nav';

const c = (slug: string, title: string, parent: string | null = null): CollectionDTO => ({ id: slug, slug, title, description: '', parent, heroImage: null, count: 3, seo: {} });

describe('navFromCollections', () => {
  it('shows child collections instead of their parent, then Journal', () => {
    const nav = navFromCollections([c('jacket', 'Leather Jackets'), c('mens-jacket', "Men's Leather Jackets", 'jacket'), c('belts', 'Belts')]);
    expect(nav.map((n) => n.href)).toEqual(['/collections/mens-jacket', '/collections/belts', '/journal']);
  });
  it('keeps a parent that has no active children', () => {
    expect(navFromCollections([c('jacket', 'Leather Jackets')]).map((n) => n.href)).toContain('/collections/jacket');
  });
});

describe('swatchColour', () => {
  it('maps only from the colour name', () => {
    expect(swatchColour('Grayish Black')).toBe('#4b4b4b');
    expect(swatchColour('Maroon')).toBe('#5c1522');
    expect(swatchColour('Hand Painted Textured Tan')).toBe('#a8743f');
    expect(swatchColour('Rough Textured')).toBeNull();
  });
});
