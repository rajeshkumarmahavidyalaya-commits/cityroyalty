export const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Search indexing is opt-in (NEXT_PUBLIC_INDEXABLE=true), so previews and staging copies never compete with the live site. */
export const INDEXABLE = process.env.NEXT_PUBLIC_INDEXABLE === 'true';
