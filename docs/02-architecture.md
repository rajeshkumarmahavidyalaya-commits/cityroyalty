# 02 · Architecture

```
cityroyalty/
├─ apps/
│  ├─ web/        Next.js 16 App Router storefront (RSC, Tailwind 4, Motion)  → Vercel
│  ├─ admin/      Next.js 16 admin dashboard (role gated, noindex)              → Vercel (separate project)
│  ├─ api/        Express 5 + Drizzle/Postgres REST API                        → Vercel Function or any Node host
│  └─ showcase/   Original three.js jacket microsite (static, unchanged)
├─ packages/
│  └─ shared/     zod schemas, TS types, money/slug helpers, API contract (single source of truth)
├─ e2e/           Playwright suites (storefront + admin + API smoke)
└─ docs/
```

## Principles

* **One source of truth for business rules.** Pricing, stock reservation, discount validation, shipping and order totals live only in `apps/api`. `apps/web` and `apps/admin` call the API; they never recompute money. `packages/shared` holds *types and validation schemas only* (plus pure formatting helpers).
* **Server authority.** The cart total, shipping fee, discount and stock are recomputed server-side at checkout; client values are display hints.
* **Money is integer paise** end to end. Display formatting is the only place a decimal appears.
* **Draft → Review → Published** is a first-class product state (`status`) plus per-field `provenance` (`woocommerce`, `manual`, `concept`). Only `published` products are visible in the public API.
* **Concept images can never be published as merchandise**: image records carry `kind: photo | concept`; the publish endpoint rejects a product whose images are all `concept` (see `product-accuracy.md`).

## Backend (apps/api)

* Express 5, `helmet`, `cors` allow-list, `express-rate-limit` (global + stricter on auth/checkout), `pino` structured logging with request ids, central error handler returning `{error:{code,message,details}}`.
* Postgres (Supabase in production) via Drizzle ORM, all tables in a private `cr` schema that PostgREST does not expose, RLS enabled on every table. Tables: `users`, `addresses`, `products`, `variants`, `product_images`, `assets`, `collections`, `carts`, `wishlists`, `orders` + `order_lines`, `payments`, `payment_events` (idempotency ledger, unique provider+event id), `discounts`, `shipments`, `returns`, `articles`, `pages`, `campaigns`, `subscribers`, `settings`, `audit_logs`; order numbers from `cr.order_number_seq`. Schema in `apps/api/src/db/schema.ts`, migrations in `apps/api/drizzle/`.
* Auth: access JWT in `httpOnly; SameSite=Lax; Secure` cookie (+ CSRF double-submit header for state-changing requests from browsers), bcrypt password hashes, password-reset tokens (hashed at rest), roles `customer | content | manager | admin`.
* Inventory: stock lives on variants. Checkout runs in one transaction (discount use + stock + order insert, all or nothing) and decrements with a conditional `UPDATE … WHERE stock >= qty` so two buyers can never oversell; on payment failure/expiry the reservation is released (swept lazily on cart/checkout requests, so it also works on serverless). Webhooks are idempotent via the unique `payment_events` key.
* Payments: provider adapter interface (`createOrder`, `verifySignature`, `parseWebhook`, `refund`) with Razorpay (India), Stripe (international, behind a flag) and a `mock` adapter for development/tests. Only provider tokens/ids are stored — never card data.
* Images: `sharp` pipeline → AVIF + WebP at 320/640/960/1280/1920 w, blur placeholder, content-hash filenames; storage adapter (`local` for dev, `s3`, or `supabase` — uploads through the `media-upload` Edge Function into a public Storage bucket).
* Notifications: email adapter (SMTP/nodemailer; `console` transport in dev) for order confirmation, shipped, password reset, payment-failed recovery.

## Frontend (apps/web)

* Server Components fetch from the API with tagged `fetch` caching (`revalidate` + on-demand revalidation webhook from the API on publish). Client components only where interaction needs it (cart, filters, gallery).
* Tailwind 4 theme tokens from the brand palette; fonts via `next/font` (Playfair Display, Inter).
* Motion used sparingly: scroll reveals, page transitions, drawer, gallery; all gated by `prefers-reduced-motion`.
* The homepage hero is a static server-rendered section (headline, CTA, a real product photo). The scroll-driven 3D jacket hero was removed at the owner's request; the original microsite remains in `apps/showcase`.
* SEO: `generateMetadata`, canonical URLs, JSON-LD (Organization, Product + Offer, BreadcrumbList), `sitemap.ts`, `robots.ts`, OG images.

## Deployment shape

| Piece | Host | Notes |
| --- | --- | --- |
| apps/web | Vercel | env: `API_URL`, `NEXT_PUBLIC_SITE_URL` |
| apps/admin | Vercel | env: `API_URL`; `X-Robots-Tag: noindex` |
| apps/api | Vercel Function (`src/vercel.ts`) or Node host | env in `.env.example`; Supabase Postgres via the transaction pooler |
| Images | Supabase Storage (public `media` bucket) or S3/R2 + CDN | `STORAGE_DRIVER=supabase` or `s3` |

See `06-deployment.md`.
