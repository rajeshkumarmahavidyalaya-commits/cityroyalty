# 06 · Environments, deployment and launch checklist

> **Status: nothing in this repository has been deployed.** The steps below are a plan to be executed and verified by the owner. Do not announce a launch until each gate is ticked with evidence.

## Environments

| Env | Purpose | Storefront | Admin | API | DB |
| --- | --- | --- | --- | --- | --- |
| local | development | `npm run dev:web` :3000 | `npm run dev:admin` :3001 | `npm run dev:api` :4000 | `npm run dev:db` (local MongoDB) |
| staging | verification before launch | `staging.cityroyalty.in` (Vercel project, *Preview/Production of staging branch*) | `admin-staging.cityroyalty.in` | `api-staging.cityroyalty.in` | separate Atlas cluster/database |
| production | live | `cityroyalty.in` | `admin.cityroyalty.in` | `api.cityroyalty.in` | Atlas M10+ (backups on) |

The production WordPress site keeps serving `cityroyalty.in` until cut-over (see `05-migration-plan.md`).

## 1. Provision

1. **MongoDB Atlas**: create a cluster per environment, a database user with `readWrite` on `cityroyalty`, IP allow-list for the API host, and enable continuous backups on production. Copy the SRV URI into `MONGODB_URI`.
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

Never run `seed --demo` against anything customer-facing. Indexes are created automatically on first boot (`autoIndex`); for very large catalogues create them in a maintenance window.

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
5. Monitor: Vercel logs, API logs (JSON, request-id), Atlas metrics, Razorpay dashboard, 404 report in Search Console.

**Rollback**: repoint DNS to the old host (untouched for 14 days). No data on the old site was modified. Orders taken on the new platform during the window are exported from Admin → Orders and re-keyed.

## 6. Operations

* **Backups**: Atlas continuous backup; test a restore quarterly. Media bucket versioning on.
* **Updating the catalogue**: all through Admin. Publishing triggers revalidation so the storefront updates within seconds.
* **Security**: rotate `JWT_SECRET` (logs everyone out) and provider secrets on staff changes; review Admin → Audit log; staff accounts use unique strong passwords (MFA is a known gap — see README "Known limitations").
