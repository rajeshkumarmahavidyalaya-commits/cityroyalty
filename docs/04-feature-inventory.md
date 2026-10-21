# 04 · Feature inventory

Status legend: ✅ planned for this build · 🔌 built behind an adapter/flag (needs the merchant's live credentials) · ⏭ explicitly deferred.

| Area | Feature | Status |
| --- | --- | --- |
| Brand | Original identity (tokens, type, logo wordmark placeholder until real logo file supplied) | ✅ |
| Home | 3D jacket hero, collections, new arrivals, editorial, featured (curated), craftsmanship, journal, newsletter | ✅ |
| Home | "Bestsellers" from real sales data | ✅ computed from paid orders once data exists; curated *Featured* until then |
| Browse | Collection pages, filters (category, size, colour, material, price, availability), sort, grid/list, mobile filter drawer, swatches, wishlist, quick view, incremental loading | ✅ |
| Product | Gallery with thumbnails + zoom (5 slot types), variants, size guide, material & care, stock, quantity, add to bag, buy now, wishlist, delivery info from settings, related | ✅ |
| Cart | Persistent (local + server for signed-in), drawer, variant aware, stock validation, discount codes, shipping calc | ✅ |
| Checkout | Guest checkout, address validation (India PIN), payment via Razorpay/Stripe hosted flows, mock provider for dev, confirmation, failed-payment recovery | ✅ / 🔌 live keys |
| Orders | Order history, tracking lookup, transactional email | ✅ / 🔌 SMTP |
| Account | Signup/login, password reset, address book, wishlist, profile, deletion request | ✅ |
| Admin | Products + variants + images, collections, inventory, prices & discounts, orders, fulfilment/shipments, returns/cancellations/refunds, customers, homepage campaigns, journal, SEO, subscribers, publication workflow, settings, reports, audit log | ✅ |
| Migration | WooCommerce snapshot importer (products, variants, categories, posts, pages, image metadata + download/optimise) | ✅ |
| Migration | Customer & order import | ⏭ needs WooCommerce admin export (CSV) — importer accepts the standard Woo CSV export format; not bundled because no private data was supplied |
| SEO | Sitemap, robots, canonical, JSON-LD, OG, legacy 301s | ✅ |
| i18n | INR now; currency + market tables in settings for future | ✅ architecture only |
| Reviews / ratings | Not implemented — no verified reviews exist | ⏭ (schema ready, UI hidden) |
| Marketplace/COD | Cash on delivery toggle in settings (off by default) | ✅ |
