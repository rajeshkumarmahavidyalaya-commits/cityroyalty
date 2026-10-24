# Design system

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `royal` | `#080808` | Primary text/ink, header on dark, primary buttons |
| `heritage` | `#4E2E1F` | Accent surface (editorial blocks, hover on dark) |
| `tan` | `#8B5E3C` | Accent text/links, price-on-sale, focus ring offset accent |
| `stone` | `#D8C9B5` | Borders, dividers, muted panels |
| `ivory` | `#F7F4EE` | Page background |
| `white` | `#FFFFFF` | Cards, inputs |

Browns are accents only: black/ivory/neutrals dominate. Contrast checked: royal on ivory 18.6:1, tan on ivory 4.9:1 (AA for normal text), ivory on heritage 11.7:1; stone is never used for text.

## Type

* Headings: **Playfair Display** (400/500; large, tight tracking, sentence case) via `next/font`.
* UI, nav, prices: **Inter**; eyebrow labels 11–12 px, uppercase, 0.18em tracking.
* Scale: fluid `clamp()` display sizes (hero up to 7.5rem), body 16/1.6.

## Layout and spacing

* 12-col grid, max width 1440, gutter 16 → 40 px; generous vertical rhythm (section padding `clamp(4rem, 9vw, 9rem)`).
* Product imagery is always 4:5; campaign banners 21:9 desktop / 4:5 mobile.

## Components (packages/ui is not split out; they live in `apps/web/src/components/ui` and `apps/admin/src/components`)

Button, IconButton, Eyebrow, Container, Section, ProductCard (hover swaps to 2nd image, colour swatches, wishlist), Price, Badge, Swatch, SizePicker, Quantity, Drawer, Dialog, Accordion, Skeleton, Toast, Gallery (thumbs + zoom), Reveal (scroll), Marquee-free announcement bar.

## Interaction rules

* Motion durations 200–500 ms, ease `cubic-bezier(.22,.61,.36,1)`. Scroll reveals translate ≤ 24 px.
* `prefers-reduced-motion`: reveals/transitions collapse to opacity, smooth scrolling off.
* Focus: 2 px royal ring with 2 px ivory offset on every interactive element; skip link; drawers trap focus and restore it.
* Images: `next/image`, AVIF/WebP, blur placeholder, fade-in on load, explicit aspect ratio (no CLS).
