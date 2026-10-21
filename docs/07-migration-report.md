# 07 · Migration report (run of 2026-10-21)

Source: public WooCommerce Store API / WP REST snapshot in `apps/api/data/woo-snapshot/`.
Command: `npm run import:woo -w @cityroyalty/api -- --images` (idempotent; re-running never overwrites human edits).

| Result | Count |
| --- | ---: |
| Products imported (kept `wooId`, SKU, title, slug, price, compare-at price, description) | **109** |
| Collections created (slugs preserved) | 7 |
| Product photographs downloaded, optimised (AVIF + WebP × up to 5 widths, blur placeholder) and mapped | **396 images → 346 unique assets** |
| Journal articles / info pages imported (sanitised HTML) | 5 / 4 |
| Redirect rules (legacy → new URLs) | 22 (`apps/web/next.config.ts`) |

## What is NOT live and why

After import every product is a **draft**. The importer only promotes a product to *review* when nothing blocks it, and never publishes. Blockers found:

| Blocker | Products |
| --- | ---: |
| Stock quantity unknown (WooCommerce does not expose stock publicly) | 109 (all) |
| No product photograph on the live store | 54 — all 20 jewellery, 13 men's + 7 women's jackets, 8 bags, 3 wallets, 3 belts |
| Price is 0 on the live store (treated as *missing*, not free) | 6 — `CRBLMGN09`×2, `CRBLMGN08`, `BIKESUJK1`, `DGNJK1`, `TEXBWN3` |
| Simple products listing several colours but no variants (needs a human decision) | 2 |

Consequences already enforced by the API: *Jewellery* and *Wallets* have no publishable products, so those collections are hidden from navigation, the homepage and sitemap ("do not activate categories without confirmed products").

## Data assumptions to verify before launch

* **Per-variant prices** are not public; every variant inherits the parent product's price. Check variable products whose sizes/colours are priced differently on the live store.
* **Image slot mapping** is positional (1st → front, 2nd → back, 3rd → studio, 4th → detail, 5th → lifestyle, extras → detail). The live store has no slot metadata, so an admin should confirm/reassign slots; storefront order follows slot order. Alt text is generated ("<title> — photo n") and should be reviewed.
* **Stock**: enter real quantities (Admin → Inventory) or mark variants *made to order*, then review/publish.
* **Material**: only inferred where the title literally says "Suede". Everything else is empty until entered.
* Customers/orders were **not** migrated (no private data supplied). See `05-migration-plan.md` for the CSV path.

## Local demo data

`npm run seed -w @cityroyalty/api -- --demo --images` additionally sets **demo stock = 12**, publishes the 49 products that have photos *and* a price, adds a `WELCOME10` code and demo accounts. It refuses to run with `NODE_ENV=production` and must never be used on a customer-facing database.
