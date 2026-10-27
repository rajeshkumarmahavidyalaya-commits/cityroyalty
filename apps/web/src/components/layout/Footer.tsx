import Link from 'next/link';
import type { PublicSettingsDTO } from '@cityroyalty/shared';
import { Newsletter } from './Newsletter';
import type { NavItem } from '@/lib/nav';

const INFO = [
  ['faqs', 'FAQs'],
  ['shipping', 'Shipping'],
  ['refund-and-returns', 'Refund & returns'],
  ['lifetime-guarantee', 'Lifetime guarantee'],
  ['privacy-policy', 'Privacy policy'],
  ['about', 'About us'],
] as const;

/** `pages`: slugs of published info pages — unpublished ones (e.g. a placeholder FAQ) are not linked. */
export function Footer({ settings, nav, pages }: { settings: PublicSettingsDTO | null; nav: NavItem[]; pages: string[] }) {
  const s = settings;
  return (
    <footer className="on-dark mt-auto bg-royal text-ivory">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <p className="font-serif text-3xl uppercase tracking-[0.28em]">City Royalty</p>
          <p className="mt-4 max-w-sm text-sm text-stone">Wear a higher standard. Leather jackets, bags and accessories from India.</p>
          <Newsletter />
        </div>
        <nav aria-label="Shop" className="md:col-span-2">
          <p className="eyebrow mb-4 text-stone">Shop</p>
          <ul className="space-y-2 text-sm">
            {nav.map((n) => (<li key={n.href}><Link className="link-u" href={n.href}>{n.label}</Link></li>))}
            <li><Link className="link-u" href="/collections/all">All products</Link></li>
          </ul>
        </nav>
        <nav aria-label="Help" className="md:col-span-2">
          <p className="eyebrow mb-4 text-stone">Help</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="link-u" href="/track-order">Track an order</Link></li>
            {INFO.filter(([slug]) => pages.includes(slug)).map(([slug, label]) => (
              <li key={slug}><Link className="link-u" href={`/pages/${slug}`}>{label}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-3">
          <p className="eyebrow mb-4 text-stone">Contact</p>
          <address className="space-y-2 text-sm not-italic text-ivory/90">
            {s?.address && <p>{s.address}</p>}
            {s?.supportEmail && <p><a className="link-u" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></p>}
            {s?.supportPhone && <p><a className="link-u" href={`tel:${s.supportPhone.replace(/\s/g, '')}`}>{s.supportPhone}</a></p>}
          </address>
          <ul className="mt-5 flex gap-5 text-sm">
            {s?.social.instagram && <li><a className="link-u" href={s.social.instagram} rel="noopener noreferrer" target="_blank">Instagram</a></li>}
            {s?.social.facebook && <li><a className="link-u" href={s.social.facebook} rel="noopener noreferrer" target="_blank">Facebook</a></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="container-x flex flex-col justify-between gap-2 py-5 text-xs text-stone sm:flex-row">
          <p>© {new Date().getFullYear()} City Royalty. All rights reserved.</p>
          <p>Prices in INR (₹). {s?.tax.note ?? ''}</p>
        </div>
      </div>
    </footer>
  );
}
