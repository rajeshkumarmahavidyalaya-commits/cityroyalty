# 06 · Environments, deployment and launch checklist

> **Status: nothing in this repository has been deployed.** The steps below are a plan to be executed and verified by the owner. Do not announce a launch until each gate is ticked with evidence.

## Environments

| Env | Purpose | Storefront | Admin | API | DB |
| --- | --- | --- | --- | --- | --- |
| local | development | `npm run dev:web` :3000 | `npm run dev:admin` :3001 | `npm run dev:api` :4000 | `npm run dev:db` (local Postgres) |
| staging | verification before launch | `staging.cityroyalty.in` (Vercel project, *Preview/Production of staging branch*) | `admin-staging.cityroyalty.in` | `api-staging.cityroyalty.in` | separate Supabase project |
| production | live | `cityroyalty.in` | `admin.cityroyalty.in` | `api.cityroyalty.in` | Supabase Pro (PITR backups on) |

The production WordPress site keeps serving `cityroyalty.in` until cut-over (see `05-migration-plan.md`).

## 1. Provision

1. **Supabase** (one project per environment): apply `apps/api/drizzle/*.sql` in order (or boot the API once with `RUN_MIGRATIONS=true`). Create a dedicated login role for the API (not `postgres`) with `USAGE` on schema `cr`, table/sequence privileges, and RLS policies for that role only — `cr` is never exposed through PostgREST. Connect through the Supavisor pooler in **session mode** (`aws-0-<region>.pooler.supabase.com:5432`, user `<role>.<project-ref>`) — either `DATABASE_URL` or `DB_HOST/DB_PORT/DB_USER/DB_NAME` + secret `DB_PASSWORD` — with `DB_POOL_MAX=1` on serverless. Transaction mode (6543) was observed to drop a result for some query mixes, hanging requests until the function timed out. `GET /health/db` reports connectivity (error code only). Enable PITR backups on production.
2. **Object storage + CDN** for images: an S3-compatible bucket (AWS S3 / Cloudflare R2) with public-read for `images/*` behind a CDN domain (`https://cdn.cityroyalty.in`). Set `STORAGE_DRIVER=s3`, `S3_*`, and `PUBLIC_MEDIA_URL=https://cdn.cityroyalty.in`. Objects are content-hashed and uploaded with `Cache-Control: immutable`.
3. **API host** (Render / Railway / Fly.io / a VPS): Node ≥ 20. Use the supplied `Dockerfile` (`apps/api/Dockerfile`) or `npm ci && npm run build -w @cityroyalty/api && npm start -w @cityroyalty/api`. Health check: `GET /health`. Set `TRUST_PROXY=1`.
4. **Vercel** — two projects from this repo:
   * `cityroyalty-web`: Root Directory `apps/web`, Install Command `cd ../.. && npm ci`, Build Command `npm run build`. Env: `API_URL`, `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET`.
   * `cityroyalty-admin`: Root Directory `apps/admin`, same install command. Env: `API_URL`. Add Vercel Password Protection or IP allow-list as an extra layer.
5. **DNS** (after staging sign-off): `api.` → API host, `cdn.` → CDN, apex/`www` → Vercel (see cut-over).

## 2. Configure (never commit secrets)

Copy the `.env.example` files (`apps/api`, `apps/web`, `apps/admin`) into each platform's secret manager.

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | 48+ random bytes: `openssl rand -base64 48`. The API refuses to boot in production without it |
| `PAYMENT_MOCK_ENABLED` | must be unset/false in production (boot fails otherwise) |
| `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | use **test** keys on staging; webhook URL `https://api…/api/v1/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed` |
| `STRIPE_*` | optional (international); webhook `https://api…/api/v1/webhooks/stripe` for `payment_intent.succeeded` / `.payment_failed` |
| `SMTP_URL`, `MAIL_FROM` | transactional email; set SPF/DKIM for the sender domain |
| `REVALIDATE_URL`, `REVALIDATE_SECRET` | `https://<storefront>/api/revalidate` + the same secret in both projects |
| `CORS_ORIGINS` | only needed if a browser calls the API directly; the apps proxy `/api` and `/media` |

## 3. Database setup

```bash
# staging / production — run once from a trusted machine with the env vars loaded
npm ci
npm run create-admin -w @cityroyalty/api     # ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD
npm run import:woo -w @cityroyalty/api -- --images   # products, collections, journal, policy pages + optimised images
```

Never run `seed --demo` against anything customer-facing. Indexes are part of the migrations.

## 4. Staging verification (all must pass)

* [ ] `npm run typecheck && npm run lint && npm test` green; `npm run test:e2e` green against staging builds.
* [ ] Admin → Settings: shipping flat rate, free-shipping threshold, delivery estimate, return window, tax note confirmed by the owner.
* [ ] Admin → Inventory: real stock entered for every product to be sold; prices for the 6 zero-price products confirmed.
* [ ] Admin → Products: each product reviewed (photo slots, alt text, description, material/care) then published by a manager.
* [ ] Info pages (About, FAQs, Refund & returns, Privacy) re-read and approved.
* [ ] **Payments in test mode, end to end**: success, failure, abandon (stock released after 30 min), duplicate webhook, refund. Razorpay dashboard shows the webhook deliveries as 200.
* [ ] Emails received: confirmation, shipped, password reset, failed-payment recovery.
* [ ] Legacy URL redirects verified against the old site's sitemap (`/product/…`, `/product-category/…`, posts, policy pages) with `curl -I`.
* [ ] Lighthouse (mobile) on home, a collection, a product: Performance/Accessibility/Best Practices/SEO ≥ 90 on the staging build.
* [ ] `robots.txt` on staging disallows everything (use Vercel preview protection / `X-Robots-Tag`) so staging is never indexed.

## 5. Launch (gated, with rollback)

1. Lower DNS TTL to 300 s at least 48 h earlier. Take a full backup of the WordPress site + DB.
2. Put WooCommerce in maintenance mode; export orders/customers (CSV) if you want them imported.
3. Run a final import delta if the live catalogue changed (the importer is idempotent and keeps admin edits).
4. Point DNS to Vercel / API. Verify: home, a product, add to bag, **a real low-value live payment and refund**, webhook delivery, sitemap, `https://cityroyalty.in/sitemap.xml` submitted in Google Search Console.
5. Monitor: Vercel logs, API logs (JSON, request-id), Supabase database metrics, Razorpay dashboard, 404 report in Search Console.

**Rollback**: repoint DNS to the old host (untouched for 14 days). No data on the old site was modified. Orders taken on the new platform during the window are exported from Admin → Orders and re-keyed.

## 6. Operations

* **Backups**: Supabase PITR; test a restore quarterly. Media bucket versioning on.
* **Updating the catalogue**: all through Admin. Publishing triggers revalidation so the storefront updates within seconds.
* **Security**: rotate `JWT_SECRET` (logs everyone out) and provider secrets on staff changes; review Admin → Audit log; staff accounts use unique strong passwords (MFA is a known gap — see README "Known limitations").

## SEO / AEO / GEO at launch

The storefront is **not indexable until you opt in**: without `NEXT_PUBLIC_INDEXABLE=true` every page sends
`noindex, nofollow` and robots.txt disallows everything, so the vercel.app preview never competes with cityroyalty.in.
At cut-over:

1. Set `NEXT_PUBLIC_SITE_URL=https://cityroyalty.in` and `NEXT_PUBLIC_INDEXABLE=true` on the storefront project, redeploy.
2. Check `/robots.txt` (lists the sitemap; AI search crawlers such as GPTBot, ClaudeBot, PerplexityBot are allowed),
   `/sitemap.xml` (with product image entries) and `/llms.txt` (generated catalogue summary for AI assistants).
3. Google Search Console + Bing Webmaster Tools (after the domain points at Vercel):
   * Add the property `https://cityroyalty.in`. Verify with the **DNS TXT record** method (easiest), or choose
     "HTML tag", copy only the `content="…"` value and set it on the storefront project as
     `GOOGLE_SITE_VERIFICATION` (Bing: `BING_SITE_VERIFICATION`, its `msvalidate.01` value), redeploy, then click Verify.
   * Bing can import the verified site straight from Google Search Console.
   * Submit `https://cityroyalty.in/sitemap.xml` in both, inspect a product URL and run the Rich Results test
     (Product, BreadcrumbList, Organization, WebSite/SearchAction, BlogPosting, FAQPage on `/pages/faqs`).
4. Analytics: the storefront ships Vercel Web Analytics (cookieless page views; the privacy page says so). Turn it on
   once in the Vercel dashboard: project `cityroyalty-web` → **Analytics** → **Enable**. Until then
   `/_vercel/insights/script.js` returns 404 and nothing is counted.
5. Information pages (2026-10-27): FAQs, Shipping, Refund & returns, Lifetime guarantee and Privacy were rewritten
   from the owner's own published policy (15-day returns, 1–2 day processing + 2–5 day delivery, lifetime guarantee)
   and the site's actual data handling; the 30-day text was WooCommerce's sample page. The owner should still read
   them once before launch. Returns window is set to 15 days in settings.

