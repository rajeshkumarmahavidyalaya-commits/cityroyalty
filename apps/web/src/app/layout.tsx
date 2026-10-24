import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CartDrawer } from '@/components/layout/CartDrawer';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { navFromCollections } from '@/lib/nav';
import { api } from '@/lib/api';
import { SITE_URL } from '@/lib/env';
import { formatMoney } from '@/lib/format';
import { StoreProviders } from '@/lib/store';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'City Royalty — Wear a higher standard', template: '%s | City Royalty' },
  description: 'Leather jackets, bags, belts and accessories from India. Timeless leather, modern expression.',
  applicationName: 'City Royalty',
  openGraph: { type: 'website', siteName: 'City Royalty', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
};
export const viewport: Viewport = { themeColor: '#080808', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cols, settings, campaigns] = await Promise.all([api.collections(), api.settings(), api.campaigns()]);
  const nav = navFromCollections(cols?.items ?? []);
  const thr = settings?.shipping.freeThreshold;
  // an active "announcement" campaign (editable in admin) wins over the default free-shipping line
  const announcement = campaigns?.items.find((c) => c.key === 'announcement')?.headline || (thr != null ? `Free shipping on orders over ${formatMoney(thr)}` : undefined);
  return (
    <html lang="en-IN">
      <head>
        <link rel="preload" href="/fonts/playfair-display-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <StoreProviders>
          <a href="#main" className="sr-only z-[200] bg-ivory p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
          <Header nav={nav} announcement={announcement} />
          <main id="main">{children}</main>
          <Footer settings={settings} nav={nav} />
          <CartDrawer freeThreshold={thr ?? null} />
        </StoreProviders>
      </body>
    </html>
  );
}
