import type { MetadataRoute } from 'next';
import { INDEXABLE, SITE_URL } from '@/lib/env';

const PRIVATE = ['/checkout', '/account', '/cart', '/api/', '/search', '/login', '/signup', '/forgot-password', '/reset-password', '/track-order'];
/** AI search/answer crawlers, named so it is explicit they may read the catalogue (same private paths as everyone). */
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot'];

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }, { userAgent: AI_CRAWLERS, allow: ['/', '/llms.txt'], disallow: PRIVATE }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
