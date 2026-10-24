import type { PublicSettingsDTO } from '@cityroyalty/shared';
import { SITE_URL } from './env';

export const BRAND = 'City Royalty';

/** Organization entity, the same on every page so search and answer engines resolve one brand. */
export function organizationLd(settings: PublicSettingsDTO | null) {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: BRAND,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description: 'Leather jackets, bags, belts and accessories from India.',
    sameAs: [settings?.social.instagram, settings?.social.facebook].filter(Boolean),
    email: settings?.supportEmail || undefined,
    telephone: settings?.supportPhone || undefined,
  };
}

export function websiteLd() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BRAND,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
  };
}

/** `<script type="application/ld+json">` payload, safe to inline (no `</script>` break-out). */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/**
 * The "FEATURES" list from an imported product description, one fact per line, as written by City Royalty.
 * Only cleans the source's encoding damage (lost bullets → "?", lost inch marks → "23?"); never rewrites the claims.
 */
export function productFacts(description: string): string[] {
  const lines = description.split('\n').map((l) => l.trim());
  const start = lines.findIndex((l) => /^features:?$/i.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (const raw of lines.slice(start + 1)) {
    if (!raw) continue;
    if (/^[A-Z &]{3,}:?$/.test(raw)) break; // next heading, e.g. CARE
    const line = raw
      .replace(/^[?•·*\-–]\s*/, '')
      .replace(/(\d)\?/g, '$1″')
      .replace(/″”|””/g, '″')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '');
    if (line.length > 1) out.push(line);
  }
  return out.slice(0, 16);
}

/** Facts stated explicitly in the listing, for structured data. */
export function factAttributes(facts: string[]) {
  const text = facts.join(' | ');
  return {
    material: /full[- ]grain/i.test(text) ? 'Full-grain leather' : /\bleather\b/i.test(text) ? 'Leather' : undefined,
    madeInIndia: /manufactured by .*artisans in (royal )?india/i.test(text),
  };
}

/** A meta description that reads as an answer: what it is, who makes it, the price — then the listing's own opening. */
export function productMetaDescription(p: { title: string; description: string; priceFrom: number }, facts: string[]): string {
  const { material, madeInIndia } = factAttributes(facts);
  const price = p.priceFrom > 0 ? `₹${(p.priceFrom / 100).toLocaleString('en-IN')}` : null;
  const lead = [`${p.title} by ${BRAND}`, material && `in ${material.toLowerCase()}`, madeInIndia && 'made in India'].filter(Boolean).join(', ');
  const opening = p.description
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.length > 60 && /[.!?]$/.test(s));
  const text = `${lead}.${price ? ` ${price}.` : ''}${opening ? ` ${opening}` : ''}`;
  return text.length > 158 ? `${text.slice(0, 155).replace(/\s+\S*$/, '')}…` : text;
}
