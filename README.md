# City Royalty — premium leather commerce platform

> *Wear a higher standard.* A custom-coded storefront, admin dashboard and commerce API for [cityroyalty.in](https://cityroyalty.in), replacing the WordPress/WooCommerce site.

| Package | What | Stack |
| --- | --- | --- |
| `apps/web` | Customer storefront | Next.js 16 (App Router, RSC), TypeScript, Tailwind 4, Motion |
| `apps/admin` | Role-protected commerce back-office | Next.js 16, TypeScript, Tailwind 4 |
| `apps/api` | REST API, payments, inventory, import tools | Express 5, Drizzle ORM on Postgres (Supabase), zod, sharp, pino |
| `packages/shared` | Types, zod schemas, money/text helpers — the API contract | TypeScript |
| `apps/showcase` | The original standalone three.js jacket microsite (unchanged) | vanilla ES modules + three.js |
| `e2e` | Playwright end-to-end + accessibility suites | Playwright, axe-core |
| `docs` | Audit, architecture, route map, migration, deployment, policies | Markdown |

Start with **[docs/01-audit.md](docs/01-audit.md)** (what exists), **[docs/02-architecture.md](docs/02-architecture.md)** and **[docs/06-deployment.md](docs/06-deployment.md)** (how to launch safely). **Nothing here has been deployed**; see the launch checklist.

## Run it locally

Requires Node ≥ 20. No Docker needed — a local Postgres is started from an npm package.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # JWT_SECRET may stay empty in dev
npm run dev:db -w @cityroyalty/api          # terminal 1 — Postgres on :54329 (data in apps/api/.data)
npm run seed -w @cityroyalty/api -- --demo --images   # terminal 2 — imports the real catalogue + photos (≈10 min) and DEMO stock
npm run dev:api                             # :4000
npm run dev:web                             # :3000  storefront
npm run dev:admin                           # :3001  admin → admin@cityroyalty.test / Demo-admin-1234 (demo seed only)
```

Without `--images` the import is instant but products have no photos (so none can be published). The demo seed uses **mock payments** (a "simulate success/failure" panel at checkout); set Razorpay/Stripe keys in `apps/api/.env` for real test-mode payments.

## Quality gates

```bash
npm run typecheck      # shared, api, web, admin
npm run lint           # web + admin (ESLint 9, Next + a11y rules)
npm test               # shared + API + web unit tests (72, throwaway embedded Postgres)
npm run test:e2e       # Playwright (46): storefront, checkout/payment edge cases, accounts, admin, SEO, a11y (axe WCAG 2.1 AA)
```

## What is real, and what is not

* **Real data**: 109 products, variants, SKUs, slugs, prices, 396 photos, 7 collections, 5 articles and the About/FAQ/Returns/Privacy pages were imported from the live store (`apps/api/data/woo-snapshot`). Nothing is invented: unknown stock, zero prices and missing photos keep a product in **draft** (see [docs/07-migration-report.md](docs/07-migration-report.md) and [docs/missing-information.md](docs/missing-information.md)).
* **No fabricated social proof**: there are no ratings, review counts, "sold" numbers, urgency timers or certifications anywhere, and no code path that renders them. Stock labels reflect real stock.
* **Concept art is not merchandise**: the supplied AI concept pack was used only as design/art-direction reference. The API refuses to expose or publish `concept` images on products ([docs/product-accuracy.md](docs/product-accuracy.md)).
* **Payments**: Razorpay (India) and Stripe adapters use provider-hosted/tokenised flows and signature-verified, idempotent webhooks; card data never touches our servers. They are unit-tested against recorded provider behaviour but **have not been exercised against live provider accounts** — that is a launch-checklist item.

## Feature overview

Storefront: editorial homepage, collections with filters/sort/grid-list/quick view, product pages (five-slot gallery with zoom, variants, size guide, sticky mobile add-to-bag), search, wishlist, persistent cart + drawer, discount codes, server-priced shipping, guest checkout, order confirmation + failed-payment recovery, tracking, account (orders, addresses, wishlist, privacy/deletion request), journal, policy pages, JSON-LD, sitemap/robots/canonicals, legacy 301s.

Admin: dashboard & sales report, products (variants, five-slot image manager with AVIF/WebP pipeline, SEO, **draft → review → published workflow with blockers**), collections, inventory (audited), orders (status flow, shipments, refunds), returns, customers (+ data erasure), discounts, homepage campaigns, journal & pages (sanitised rich text), subscribers (CSV), settings, staff & roles (content / manager / admin), audit log.

API: ≈70 endpoints under `/api/v1`; atomic stock reservation (no overselling), idempotent checkout + webhooks, rate limiting, helmet, CSRF double-submit, httpOnly sessions, account lockout, structured logs with request ids.

## Known limitations / next steps

* Staff **MFA** and **email verification** are not implemented.
* Customer/order **import** is documented but not run (no private data was supplied).
* Razorpay/Stripe/SMTP/S3 need real credentials; GST invoicing and carrier integrations are out of scope.
* Mobile Lighthouse performance is 74–94 locally (accessibility, best practices and SEO are 100) — see [docs/08-qa-report.md](docs/08-qa-report.md); re-measure on staging behind the CDN.
* Reviews/ratings UI is intentionally absent until verified reviews exist.

## Licence & credits

Application code © City Royalty. 3D models CC BY 4.0 (see `apps/showcase/README.md`). Fonts: Inter and Playfair Display (SIL OFL).
