import type { NextConfig } from 'next';
import path from 'node:path';

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Legacy WooCommerce URLs → new routes (permanent). Product slugs are preserved verbatim. */
const legacy = [
  { source: '/product/:slug', destination: '/products/:slug' },
  { source: '/product-category/jacket/mens-jacket', destination: '/collections/mens-jacket' },
  { source: '/product-category/jacket/womens-jacket', destination: '/collections/womens-jacket' },
  { source: '/product-category/jacket', destination: '/collections/jacket' },
  { source: '/product-category/:slug', destination: '/collections/:slug' },
  { source: '/shop', destination: '/collections/all' },
  { source: '/new-shop', destination: '/collections/all' },
  { source: '/shop-shop-wooshop-v2', destination: '/collections/all' },
  { source: '/about-us-2', destination: '/pages/about' },
  { source: '/refund_returns', destination: '/pages/refund-and-returns' },
  { source: '/privacy-policy', destination: '/pages/privacy-policy' },
  { source: '/faqs', destination: '/pages/faqs' },
  { source: '/my-account', destination: '/account' },
  { source: '/blog', destination: '/journal' },
  ...['types-of-leather', 'leather-care', 'how-to-spot-fake-leather', 'genuine-leather-jackets', 'sponsoring-photography-with-poi'].map((s) => ({
    source: `/${s}`,
    destination: `/journal/${s}`,
  })),
].map((r) => ({ ...r, permanent: true }));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://js.stripe.com")' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  transpilePackages: ['@cityroyalty/shared'],
  turbopack: { root: path.join(__dirname, '../..') },
  async redirects() {
    return legacy;
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${API_URL}/media/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};
export default config;
