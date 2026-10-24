import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { formatMoney } from '@/lib/format';
import { BRAND, factAttributes, productFacts } from '@/lib/seo';

export const revalidate = 3600;

/**
 * /llms.txt — a plain-text map of the store for AI assistants and answer engines (llmstxt.org convention).
 * Generated from live catalogue data so it never drifts; every statement comes from the listings themselves.
 */
export async function GET() {
  const [cols, products, articles, pages, settings] = await Promise.all([api.collections(), api.products({ limit: 60 }), api.articles(), api.pages(), api.settings()]);
  const items = products?.items ?? [];
  const featured = items.filter((p) => p.featured);
  const details = await Promise.all(featured.map((p) => api.product(p.slug)));

  const lines: string[] = [
    `# ${BRAND}`,
    '',
    `> ${BRAND} sells leather jackets, bags, belts and accessories from India. Prices are in Indian rupees (INR). Shop: ${SITE_URL}`,
    '',
    '## Collections',
    ...(cols?.items ?? []).map((c) => `- [${c.title}](${SITE_URL}/collections/${c.slug}): ${c.count} ${c.count === 1 ? 'piece' : 'pieces'}${c.description ? ` — ${c.description}` : ''}`),
    '',
  ];
  if (featured.length) {
    lines.push('## Signature pieces', '');
    details.forEach((d, i) => {
      const p = d?.product ?? featured[i]!;
      const facts = d ? productFacts(d.product.description) : [];
      const { material, madeInIndia } = factAttributes(facts);
      const attrs = [material, madeInIndia && 'made in India', p.priceFrom > 0 && `from ${formatMoney(p.priceFrom)}`].filter(Boolean).join(', ');
      lines.push(`- [${p.title}](${SITE_URL}/products/${p.slug})${attrs ? `: ${attrs}` : ''}`);
      for (const f of facts.slice(0, 6)) lines.push(`  - ${f}`);
    });
    lines.push('');
  }
  lines.push('## All products', ...items.map((p) => `- [${p.title}](${SITE_URL}/products/${p.slug})${p.priceFrom > 0 ? `: ${formatMoney(p.priceFrom)}` : ''}`), '');
  if (articles?.items.length) lines.push('## Guides', ...articles.items.map((a) => `- [${a.title}](${SITE_URL}/journal/${a.slug})${a.excerpt ? `: ${a.excerpt}` : ''}`), '');
  const info = (pages?.items ?? []).filter((p) => p.slug !== 'size-guide');
  if (info.length) lines.push('## Store information', ...info.map((p) => `- [${p.title}](${SITE_URL}/pages/${p.slug})`), '');
  const contact = [settings?.supportEmail && `Email: ${settings.supportEmail}`, settings?.supportPhone && `Phone: ${settings.supportPhone}`, settings?.social.instagram && `Instagram: ${settings.social.instagram}`, settings?.social.facebook && `Facebook: ${settings.social.facebook}`].filter(Boolean);
  if (contact.length) lines.push('## Contact', ...contact.map((c) => `- ${c}`), '');

  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
