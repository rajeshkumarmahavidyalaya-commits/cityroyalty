# 05 · Migration plan (WooCommerce → City Royalty platform)

## What is migrated and how

| Data | Source | Method |
| --- | --- | --- |
| Products, SKUs, titles, slugs, descriptions, prices, sale prices | WooCommerce Store API snapshot (`apps/api/data/woo-snapshot/products.json`) | `npm run import:woo -w apps/api` (idempotent upsert keyed on `wooId`) |
| Variants (Size/Color) | `variations[]` + attribute terms | One variant per attribute combination; **stock quantity is not exposed publicly**, so variants import as `stock: null` = *unknown* and the product stays **draft** until stock is entered (or marked "made to order") in admin |
| Categories | `categories[]` | Mapped to collections; `Jacket` → parent, `Mens Jacket`/`Womens Jacket` → children |
| Images | `images[].src` (WordPress uploads) | `--images` flag downloads originals, runs the sharp pipeline and stores AVIF/WebP ladders. `kind: photo` (they are real store photos). Alt text generated from product title + slot, editable in admin |
| Journal articles, policy pages | `posts.json`, `pages.json` | Cleaned to semantic HTML; About/Policy copy is shown verbatim (verified brand content) |
| Customers, orders | **Not publicly available** | Importer for the standard WooCommerce CSV export is documented; run after the merchant exports from WP-admin. Passwords cannot be migrated (WordPress hashes) — customers use "forgot password" on first login |

## Import rules (accuracy)

1. Prices are imported from the live store *as-is*; `price = 0` is treated as **missing**, not free → product is imported as `draft` with `priceMissing`.
2. A product is auto-promoted to `review` only when it has: title, slug, ≥1 photo, price > 0, a category, and every variant has stock info. Anything else stays `draft` with a machine-readable list of `blockers` shown in admin.
3. Nothing is auto-`published`; a human moves `review → published` in admin (audit logged).
4. No ratings/reviews are imported or fabricated.

## URL and SEO preservation

* Slugs preserved; legacy path patterns 301 to the new routes (table in `03-route-map.md`).
* Canonical URLs and the new `sitemap.xml` ship with the storefront; submit it in Search Console after launch.
* Keep the old WordPress alive on a staging hostname during validation so redirects can be diffed against it.

## Cut-over and rollback

1. Build and verify on staging (`staging.cityroyalty.in`): import, QA checklist (`06-deployment.md`), test-mode payments end to end.
2. Freeze WooCommerce orders (maintenance banner), take a full WP + DB backup, run a final delta import (customers/orders CSV).
3. Switch DNS (low TTL set 48 h earlier). The old host stays untouched for 14 days.
4. **Rollback:** repoint DNS to the old host (no data was modified there). Orders taken on the new platform during the window are exported from admin and re-keyed.

No production DNS or live-site change is made by this repository; the launch checklist is a manual, gated procedure.
