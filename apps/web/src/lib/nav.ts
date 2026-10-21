import type { CollectionDTO } from '@cityroyalty/shared';

export interface NavItem {
  label: string;
  href: string;
}

export function navFromCollections(cols: CollectionDTO[]): NavItem[] {
  const parents = new Set(cols.map((c) => c.parent).filter(Boolean));
  const items = cols
    .filter((c) => !parents.has(c.slug) || !cols.some((x) => x.parent === c.slug)) // show leaves (children replace their parent)
    .map((c) => ({ label: c.title.replace(/ Leather/, '').replace(/^Men's Jackets$/, "Men's Jackets"), href: `/collections/${c.slug}` }));
  return [...items, { label: 'Journal', href: '/journal' }];
}
