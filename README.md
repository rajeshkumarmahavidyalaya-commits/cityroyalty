# City Royalty — 3D leather experience

A scroll-driven, three.js powered storefront landing page for [cityroyalty.in](https://cityroyalty.in),
with the **leather jacket** as the hero product. Inspired by the single-object, scroll-choreographed
style of oryzo.ai.

## What's in it

| Section | 3D / interaction |
|---|---|
| **Hero** | Procedural leather biker jacket, outlined wordmark behind it, pointer parallax, drag to spin, gold dust motes |
| **Story** | Jacket swings to a 3/4 view while the brand story scrolls |
| **Anatomy** | Scroll-driven camera: zoom to the brass zip, the snaps, then an **exploded view** where every part flies apart |
| **Colours** | Live recolour of the 3D jacket with the 9 real City Royalty jacket colourways, drag-to-rotate, real product photo + buy link |
| **Collection** | Second WebGL scene: a draggable 3D ring of the real product photos (best products / newly launched) |
| **Winter sale** | "50% OFF — New Winter Collection" with countdown and falling snow |
| **Shop by category** | Tilting 3D tiles linking to the real category pages |

The jacket is built entirely in code (`js/jacket.js`): a superellipse torso, tube sleeves, surface-hugging
lapels, instanced brass zip teeth, pockets, epaulettes and a procedurally generated leather-grain normal map.
No model files are needed. It is a stylised biker-jacket shape that changes colour per product — it does not
reproduce the exact cut of every women's style. To use real scans instead, load a `.glb` in `js/main.js` in place
of `buildJacket()` and keep the same `setColor` / `explode` API.

## Content source

All product names, SKUs, descriptions, prices, links, categories and images come from cityroyalty.in.
Most jackets are listed there with a price of `0.00` (enquiry / variant based), so the site shows
**"Enquire for price"** rather than inventing one. Only the Men's Brown Leather Biker Jacket shows a price
(₹13,999, was ₹18,999). Product data lives in `js/data.js`.

The sale countdown target is `SALE_ENDS` in `js/data.js` (the live site shows a timer with no date) — set it to your real end date.

## Run locally

ES modules need an HTTP server (opening `index.html` from disk will not work):

```bash
npm start            # or: python3 -m http.server 8080
```

Then open http://localhost:8080. It is a fully static site (no build step) and can be deployed as-is to
Vercel, Netlify, GitHub Pages or any static host. three.js (r170) is vendored in `vendor/`.

## Structure

```
index.html          markup + copy
css/style.css       design system, themes (light / dark / ink), responsive
js/main.js          main scene, scroll-pose choreography, configurator, UI
js/jacket.js        procedural jacket (geometry, leather material, exploded view)
js/carousel.js      3D product ring (second renderer)
js/data.js          products, categories, links
assets/img/         product photos + logo from cityroyalty.in
vendor/             three.js + RoomEnvironment
```

Respects `prefers-reduced-motion`, falls back to a static product photo if WebGL is unavailable, and adapts the
3D layout for portrait screens.
