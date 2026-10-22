# 08 · QA report (2026-10-22)

All checks below were run locally in this repository. They are the evidence for Phase 7; they are **not** a substitute for the staging checklist in `06-deployment.md` (real payment accounts, real devices, real network).

## Automated gates

| Gate | Command | Result |
| --- | --- | --- |
| Type check (shared, api, web, admin) | `npm run typecheck` | ✅ 0 errors |
| Lint (web, admin — Next, React hooks, a11y rules) | `npm run lint` | ✅ 0 errors, 0 warnings |
| Unit / integration (API on in-memory MongoDB) | `npm test` | ✅ 61 API + 8 shared + 3 web = **72 passed** |
| End-to-end + accessibility (Playwright, desktop 1440×900 and Pixel 7) | `npm run test:e2e` | ✅ **46 passed** |

### What the API suite proves
Server-side pricing ignores client prices; free-shipping threshold and flat rate; unknown shipping blocks checkout instead of guessing; **6 concurrent buyers for 3 units → exactly 3 succeed**; single-use discount can't be redeemed twice concurrently; idempotent checkout (double click = one order, one stock deduction); failed payment releases stock + discount and is recoverable; abandoned payments expire and restock; webhooks: bad signature rejected, duplicates processed once, amount mismatch flagged, a late failure never un-pays an order, a late success after expiry re-takes stock; refunds capped; cancellation restocks exactly once; drafts/concept images never exposed; publish blocked without a verified photo, price and stock; role gates for content/manager/admin; CSRF, account lockout, single-use reset tokens; HTML sanitising; importer is idempotent and never overwrites admin edits; missing media returns 404.

### What the browser suite proves
Home + 3D hero (canvas renders, no page errors or failing assets); collection filters/sort/empty state; search overlay + results; PDP price, compare-at, sold-out size, size validation; bag quantity/discount/persistence; wishlist; **guest checkout → mock payment → confirmation → order tracking**; failed payment → recovery page → retry; last-unit race between two shoppers; sign-up, address book prefill, order history, sign-out; admin role gating; **draft → blockers → concept image (still blocked) → photo → review → publish → visible on storefront without the concept image**; fulfilment with tracking visible to the customer; inventory edit, discount creation, audit trail; settings; sitemap/robots/canonical/JSON-LD (no fabricated ratings); legacy URL redirects; noindex on transactional pages; branded 404; **axe WCAG 2.1 AA scans with no serious/critical violations** on home, collection, product, search, login, tracking, journal, info pages, cart drawer, checkout and admin login; keyboard focus trap + focus restore in drawers.

### Defects found and fixed by these runs
* Size buttons announced raw values ("M-44") instead of "M (44)".
* Sold-out options and the disabled checkout link failed colour contrast.
* Product-title headings skipped a level on listing pages; card image links duplicated the title link for screen readers.
* Colour-swatch matching mis-read "Textured" as red (word-boundary bug).
* Admin image upload could clear a newly chosen file after a previous upload finished.
* A missing media file returned HTTP 500 instead of 404.
* No favicon (404 on every page).
* On machines without a GPU (software WebGL) the 3D hero saturated the main thread; it now falls back to the static hero.

## Lighthouse (mobile preset, simulated slow 4G + 4× CPU, local production build)

| Page | Performance | Accessibility | Best practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| Home | 74–86 | 100 | 100 | 100 |
| Collection | 82–88 | 100 | 100 | 100 |
| Product | 85–89 | 100 | 100 | 100 |
| Journal | 94–100 | 100 | 100 | 100 |

CLS is 0 everywhere; TBT 100–460 ms. Ranges are across runs on a shared, loaded container. **Performance is below the 90 target on mobile**: the LCP element is the first product photo (≈3.7–4.3 s on simulated slow 4G). Lighthouse runs without a GPU, so it measures the static hero fallback, not the 3D experience. Next steps, to be measured on staging with the CDN in front:
* serve media from the CDN domain (`PUBLIC_MEDIA_URL`) with long-lived caching and HTTP/2/3 — locally images go through the Next rewrite proxy;
* add `<link rel="preload" imagesrcset>` for the first product image on PDP/collection;
* consider a smaller first-width (480 w) in the image ladder for phones.

## Not covered here (must be done on staging)
Live Razorpay/Stripe accounts and webhooks, SMTP delivery, S3/CDN storage, real iOS/Android devices, real-network Core Web Vitals, load testing.
