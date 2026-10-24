# Product & image accuracy policy

1. **Source of truth** for product facts (title, SKU, slug, variants, description, price) is the live store snapshot. Anything else is either entered by an admin or absent.
2. **Concept images** (the supplied AI pack) are tagged `kind: "concept"`. They may be used for editorial/art-direction slots, and on a product page only as **styling imagery**: the API serves them in `product.styling` (never in `product.images`, the gallery, or listing cards) and the storefront shows them in a "Styled look" section with the note *"Styling imagery of a similar look. The piece shown may differ in details — the photographs above show this exact product."* They never unlock publishing: `PATCH /admin/products/:id/status → published` fails if the product has no `kind: "photo"` image.
3. **Five image slots** per product: `front`, `back`, `studio`, `detail`, `lifestyle`. Imported WooCommerce photos fill `front` first, then `back`/`studio`/`detail` in order; admins can reassign slots. A missing slot is simply not shown.
4. Missing/unknown values are **never defaulted to something plausible**: no stock → "Stock being confirmed" and checkout disabled; no price → product stays draft; no material/care text → section omitted.
5. Prohibited content (enforced by review, and by the absence of any code path that renders it): invented reviews or ratings, sales/"sold" counters, certifications (e.g. "full-grain", "ISO", "Leather Mark") unless entered in the product's material field by an admin, delivery-time promises other than those configured in settings, "limited stock" urgency not driven by real stock numbers.
6. Brand claims on the site (est. 2018, free shipping above ₹600, 24/7 support, gift card up to ₹500) come from the live site and are editable in admin settings.

## Where the concept pack is used (live preview)

Finished with `tools/image-finishing` (upscale + photographic grade) and placed only next to products they resemble:

| Slot | Concept image | Real products it sits beside |
| --- | --- | --- |
| Homepage editorial band | Royale biker jacket, motorcycle lifestyle | Black biker jackets |
| Men's Leather Jackets header | Royale biker jacket, front model | Black biker jackets |
| Women's Leather Jackets header | Nova jacket, front model | Chocolate / rough-brown women's jackets |
| Leather Jackets header | Nova jacket, café lifestyle | Women's brown jackets |
| Leather Bags header | Heritage weekender studio shot, leather graded toward the real mahogany duffles | Atticus / Barrel duffle |

Not placed (in the admin media library only): the shacket, blazer and wallet sets — City Royalty does not sell those
designs, so showing them would advertise products customers cannot buy. Not used at all: the five "proposed" groups
(thumbnail-sized) and any view showing the generated "CITY ROYALTY" label, which is not the real brand label.
None of these images is attached to a product gallery; product pages show only real product photographs.

