# 03 · Route map

## Storefront (apps/web)

| Route | Purpose | Rendering |
| --- | --- | --- |
| `/` | Home: hero (3D jacket scroll experience), collections, new arrivals, editorial, featured, craftsmanship, journal, newsletter | RSC + ISR |
| `/collections` | All collections | ISR |
| `/collections/[slug]` | Collection / category listing with filters, sort, grid-list, quick view | RSC + client filters (URL-driven) |
| `/products/[slug]` | Product detail (gallery, variants, size guide, add to bag, buy now, related) | ISR + on-demand revalidate |
| `/search` | Search results | dynamic |
| `/journal`, `/journal/[slug]` | Editorial / care guides | ISR |
| `/cart` | Full cart page (drawer is available everywhere) | client |
| `/checkout` | Guest or signed-in checkout (address → shipping → payment) | client + API |
| `/checkout/success?order=` , `/checkout/failed?order=` | Confirmation / payment recovery | dynamic |
| `/account`, `/account/orders`, `/account/orders/[number]`, `/account/addresses`, `/account/wishlist`, `/account/profile` | Customer area | client (auth) |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth | client |
| `/track-order` | Order lookup by number + email | client |
| `/pages/[slug]` | Policy and info pages (About, FAQs, Refund & Returns, Privacy, Shipping) | ISR |
| `/sitemap.xml`, `/robots.txt` | SEO | generated |

### Redirects from the legacy WooCommerce site (301)

| Legacy | New |
| --- | --- |
| `/product/:slug` | `/products/:slug` |
| `/product-category/jacket/mens-jacket` | `/collections/mens-jacket` |
| `/product-category/jacket/womens-jacket` | `/collections/womens-jacket` |
| `/product-category/jacket` | `/collections/jackets` |
| `/product-category/:slug` | `/collections/:slug` |
| `/shop`, `/new-shop`, `/shop-shop-wooshop-v2` | `/collections/all` |
| `/about-us-2` | `/pages/about` |
| `/refund_returns` | `/pages/refund-and-returns` |
| `/privacy-policy` | `/pages/privacy-policy` |
| `/faqs` | `/pages/faqs` |
| `/track-order`, `/my-account`, `/cart`, `/checkout`, `/wishlist` | same-purpose new routes |
| `/<post-slug>` (5 posts) | `/journal/<post-slug>` |

Product slugs are preserved verbatim, so `/product/<slug>` → `/products/<slug>` is a pure prefix rewrite (implemented in `next.config.ts`, covered by tests).

## Admin (apps/admin)

`/login`, `/` (dashboard + reports), `/products`, `/products/new`, `/products/[id]` (variants, images, SEO, publish workflow), `/collections`, `/inventory`, `/orders`, `/orders/[id]` (fulfilment, shipments, refunds), `/returns`, `/customers`, `/discounts`, `/campaigns` (homepage), `/journal`, `/subscribers`, `/settings`, `/audit-log`.

## API (apps/api) — `/api/v1`

Public: `GET /products`, `/products/:slug`, `/collections`, `/collections/:slug`, `/search`, `/articles`, `/pages/:slug`, `/campaigns/home`, `/settings/public`, `POST /newsletter`, `POST /cart/price` (server pricing), `POST /checkout`, `POST /checkout/verify`, `POST /webhooks/:provider`, `GET /orders/track`.
Auth: `POST /auth/signup|login|logout|forgot|reset`, `GET /auth/me`.
Customer: `/me/profile`, `/me/addresses`, `/me/orders`, `/me/wishlist`, `/me/cart`, `POST /me/delete-request`, `POST /orders/:id/return`.
Admin (role-gated): CRUD for products/variants/images/collections/discounts/campaigns/articles/settings, `/admin/orders`, `/admin/inventory`, `/admin/customers`, `/admin/returns`, `/admin/subscribers`, `/admin/reports/*`, `/admin/audit`. Catalogue import runs as a CLI (`npm run import:woo -w @cityroyalty/api`), not over HTTP.
