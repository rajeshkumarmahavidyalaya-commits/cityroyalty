# Product & image accuracy policy

1. **Source of truth** for product facts (title, SKU, slug, variants, description, price) is the live store snapshot. Anything else is either entered by an admin or absent.
2. **Concept images** (the supplied AI pack) are tagged `kind: "concept"`. They may be used for editorial/art-direction slots on the site (clearly campaign material, never attached to a purchasable product) and are **blocked** by the API from the gallery of a published product: `PATCH /admin/products/:id/status → published` fails if the product has no `kind: "photo"` image.
3. **Five image slots** per product: `front`, `back`, `studio`, `detail`, `lifestyle`. Imported WooCommerce photos fill `front` first, then `back`/`studio`/`detail` in order; admins can reassign slots. A missing slot is simply not shown.
4. Missing/unknown values are **never defaulted to something plausible**: no stock → "Stock being confirmed" and checkout disabled; no price → product stays draft; no material/care text → section omitted.
5. Prohibited content (enforced by review, and by the absence of any code path that renders it): invented reviews or ratings, sales/"sold" counters, certifications (e.g. "full-grain", "ISO", "Leather Mark") unless entered in the product's material field by an admin, delivery-time promises other than those configured in settings, "limited stock" urgency not driven by real stock numbers.
6. Brand claims on the site (est. 2018, free shipping above ₹600, 24/7 support, gift card up to ₹500) come from the live site and are editable in admin settings.
