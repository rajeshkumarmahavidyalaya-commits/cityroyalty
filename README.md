# City Royalty — 3D leather experience

A scroll-driven, three.js powered storefront landing page for [cityroyalty.in](https://cityroyalty.in),
with the **leather jacket** as the hero product. Inspired by the single-object, scroll-choreographed
style of oryzo.ai.

## What's in it

| Section | 3D / interaction |
|---|---|
| **Hero** | Real 3D leather biker jacket, outlined wordmark behind it, pointer parallax, drag to spin, gold dust motes |
| **Story** | Jacket swings to a 3/4 view while the brand story scrolls |
| **Anatomy** | Scroll-driven camera: zoom to the brass zip, the snaps, then an **exploded view** where every part flies apart |
| **Colours** | Live recolour of the 3D jacket with the 9 real City Royalty jacket colourways, drag-to-rotate, real product photo + buy link |
| **Anatomy callouts** | Labels pinned to points on the 3D jacket (zip, lapel, each exploded part) follow it as the camera moves |
| **Collection** | Second WebGL scene: a draggable 3D ring of the real product photos (best products / newly launched) |
| **Winter sale** | "50% OFF — New Winter Collection" with countdown and falling snow |
| **Search** | Press `/` (or the Search button) to find products and categories; results open the real product page |
| **Shop by category** | Tilting 3D tiles linking to the real category pages |

The 3D jackets are real, professionally modelled glTF assets (`assets/models/`), prepared in `js/jacket.js`:
the leather is recoloured live while the zips, snaps and studs are masked out via the metalness map, the sleeves are
cut cleanly at the shoulder for the exploded view, and the inside of the garment gets a dark lining.
Men's styles use the biker model; the women's styles use the stand-collar model. Each model keeps its own cut — only
the colour changes per product, so it is a close stand-in rather than an exact scan of every product.
To use your own scans, drop `.glb` files into `assets/models/` and point `CONFIG` in `js/jacket.js` at them.

## Credits (CC BY 4.0)

- ["Leather Biker Jacket"](https://sketchfab.com/3d-models/leather-biker-jacket-f10c673852c54fac97f4481d124d6d39) by Sigil0fSaturn
- ["Leather Jacket"](https://sketchfab.com/3d-models/leather-jacket-e23bdddd6b1a4659a0134e5efa8ee4eb) by Zoe McCue

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: textures re-encoded, models recoloured,
resized and split into parts. Keep this attribution (it is also in the page footer) if you reuse them.

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
js/jacket.js        loads the glTF jackets, live recolour, shoulder cut, exploded view
js/carousel.js      3D product ring (second renderer)
js/data.js          products, categories, links
assets/img/         product photos + logo from cityroyalty.in
assets/models/      the two jacket .glb models (CC BY 4.0)
vendor/             three.js, GLTFLoader, RoomEnvironment
```

Respects `prefers-reduced-motion`, falls back to a static product photo if WebGL is unavailable, and adapts the
3D layout for portrait screens.
