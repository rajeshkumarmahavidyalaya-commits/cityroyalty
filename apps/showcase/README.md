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

ES modules need an HTTP server (opening `index.html` from disk will not work). The source runs as-is, no build:

```bash
npm start            # or: python3 -m http.server 8080   -> http://localhost:8080
```

## Build for production

```bash
npm install
npm run build        # -> dist/   (deploy this folder)
```

The build bundles and tree-shakes the app with three.js into one minified, content-hashed file, minifies the CSS,
and rewrites `index.html` (no import map, preload hints). `vercel.json` already points Vercel at it
(`npm run build` -> `dist`), so importing the repo on Vercel needs no settings. Any static host works with `dist/`.
`npm run build:artifact` makes a variant for hosts that only serve web file types (models embedded as JS chunks).

## Why it loads fast

- **One request chain, not a waterfall.** The first jacket model, fonts, CSS and JS all start downloading at once
  (`<link rel="preload">` in `index.html`) instead of waiting for the JS module chain to evaluate.
- **Only what the first screen needs.** The women's jacket (0.6 MB) loads in idle time or when a women's colour is picked;
  the product ring is built in idle time too.
- **Small assets.** Photos are WebP at 1024px max (3.9 MB -> 0.96 MB); model textures are WebP (2.4 MB -> 1.65 MB);
  fonts are self-hosted, subset Latin woff2 (no third-party round trip). Tools to redo each: `tools/optimize_images.py`,
  `tools/optimize_glb.py`, `tools/subset_fonts.py`.
- **No main-thread stalls.** The leather grain is generated on a Web Worker while the model downloads; the mesh split is
  one pass over typed arrays; shaders and textures are compiled/uploaded behind the loader; layout is measured once, not per frame.
- Measured on a throttled phone profile (4x CPU, ~5 Mbps): first frame 7.6 s -> 3.7 s, first-load transfer 3.0 MB -> 1.65 MB.

## Structure

```
index.html          markup + copy
css/style.css       design system, themes (light / dark / ink), responsive
js/main.js          main scene, scroll-pose choreography, configurator, UI
js/studio.js        photo-studio lighting (soft-box reflections for the leather)
js/jacket.js        loads the glTF jackets (first now, the rest on demand), live recolour, shoulder cut, exploded view
js/model-source.js  how a model is read (swapped for an embedded variant by the artifact build)
tools/              build + asset-optimisation scripts
js/carousel.js      3D product ring (second renderer)
js/data.js          products, categories, links
assets/img/         product photos + logo from cityroyalty.in (WebP)
assets/fonts/       self-hosted subset fonts
assets/models/      the two jacket .glb models (CC BY 4.0)
vendor/             three.js + GLTFLoader for the no-build dev server (the build bundles from node_modules)
```

Respects `prefers-reduced-motion`, falls back to a static product photo if WebGL is unavailable, and adapts the
3D layout for portrait screens.
