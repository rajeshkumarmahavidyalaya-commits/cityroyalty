# 01 · Audit

Audit date: 2026-10-21. Everything below was observed first-hand unless marked **(not verified)**.

## Existing website (cityroyalty.in)

| Item | Finding |
| --- | --- |
| Platform | WordPress 6.x + WooCommerce, REST namespaces `wc/store/v1`, `wc/v3` |
| Theme / builders | Astra theme, Elementor Pro, Woolentor (WooCommerce template builder) |
| Other plugins | Jetpack, LiteSpeed Cache, WP Smush, FluentSMTP, Hostinger tools |
| Hosting | Hostinger (LiteSpeed). Site description: "High Quality Leather Goods Store to India." |
| Catalogue | **109 products**: 47 jackets (32 Men's, 15 Women's; the parent *Jacket* term only counts 45 because two Men's jackets are tagged with the child term alone), 22 Belts, 20 Jewellery, 17 Leather Bags, 3 Wallets |
| Product types | 40+ variable products (Size or Color attribute), the rest simple |
| Prices | Public Store API exposes prices in paise. 103 of 109 are > 0; 6 are 0 ("enquire") — see `missing-information.md` |
| Images | 396 images across 55 products. **54 products have no image at all**, no image has alt text |
| Descriptions | 101 products have a description; short descriptions are empty |
| Reviews | `review_count = 0`, `average_rating = 0` for every product. No reviews exist and none may be shown |
| Content | 5 blog posts (leather care, types of leather, spotting fake leather, genuine jackets, photography sponsorship), 14 pages (About, FAQs, Refund & Returns, Privacy/Return Policy, Track Order, …) |
| SEO URL shapes | `/product/<slug>/`, `/product-category/<slug>/`, `/product-category/jacket/mens-jacket/`, `/<post-slug>/`, `/about-us-2/`, `/refund_returns/`, `/faqs/`, `/privacy-policy/`, `/track-order/`, `/shop/` |
| Sitemap / robots | `wp-sitemap.xml` (core sitemaps); robots.txt only blocks WooCommerce upload dirs and wp-admin |
| Brand facts on site | est. 2018, free shipping over Rs. 600, gift card up to ₹500, 24/7 support, contact + maps link, Facebook + Instagram |

The snapshot used for migration is committed at `apps/api/data/woo-snapshot/` (`products.json`, `posts.json`, `pages.json`). It was fetched from the public Store API / WP REST API; no private store data (orders, customers) was accessed or is available to this project.

## Supplied asset pack (`City_Royalty_Complete_Assets_Under_30MB.zip`)

* README states plainly that the images are **AI-generated concept art for design reference, not verified product photography**. That rule is enforced in code (see `product-accuracy.md`).
* Usable-resolution imagery is limited: urban shacket, regent blazer, heritage weekender (hero) and classic bifold wallet (hero) at ~1122×1402. The royale-biker-jacket / nova crops are ~300×430 and the five proposed categories (belt, gloves, laptop briefcase, card holder, tote) are ~90×123 — too small for any live use.
* Three editorial boards are used as **art-direction references** for layout/colour only.
* Several mock-up claims (4.8 rating from 128 reviews, "Est. 2022", 10-day returns, "free shipping across India", specific prices) **contradict or are absent from the live store**. None of them is published.
* The master catalogue PDF proposes categories (shackets, blazers, gloves, card holders, …) with no matching live products. Per the brief those categories stay inactive until real products exist.

## Reference: BLUORNG

bluorng.com rate-limited automated fetches (HTTP 429) during the audit, so it was **not** scraped. Direction is taken from the brief's own list (full-width campaign banners, editorial layouts, minimal navigation, large serif/sans pairing, restrained hover states, mobile-first shopping) and the three editorial boards. No BLUORNG code, logo, copy or layout is reproduced.

## Existing repo

The repository already contains a polished three.js scroll experience (biker + women's jacket models, studio lighting, configurator). Decision (confirmed with the owner): **keep it as the homepage hero experience**, preserved as `apps/showcase` (standalone microsite, unchanged) and re-hosted as a lazy-loaded section on the new Next.js homepage.
