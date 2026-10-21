import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { IMAGE_KINDS, IMAGE_SLOTS, PRODUCT_STATUSES } from '@cityroyalty/shared';

const sourceSchema = new Schema({ w: Number, url: String }, { _id: false });

/** Optimised media library entry (one per uploaded/imported original). */
const assetSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    originalName: String,
    sourceUrl: String,
    width: Number,
    height: Number,
    bytes: Number,
    src: String,
    avif: [sourceSchema],
    webp: [sourceSchema],
    blur: String,
  },
  { timestamps: true },
);
export const Asset = model('Asset', assetSchema);

const imageSchema = new Schema({
  slot: { type: String, enum: IMAGE_SLOTS, required: true },
  kind: { type: String, enum: IMAGE_KINDS, required: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
  alt: { type: String, required: true },
  colour: String,
  position: { type: Number, default: 0 },
  width: Number,
  height: Number,
  src: String,
  avif: [sourceSchema],
  webp: [sourceSchema],
  blur: String,
});

const variantSchema = new Schema({
  sku: { type: String, required: true },
  options: { type: Map, of: String, default: {} },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, default: null },
  stock: { type: Number, default: null, min: 0 },
  madeToOrder: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  wooId: Number,
});

const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, required: true, index: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft', index: true },
    blockers: { type: [String], default: [] },
    description: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    material: String,
    /** Optional short material key used for the filter (e.g. "Suede"); only set from real data. */
    materialKey: String,
    care: String,
    collections: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    options: { type: [new Schema({ name: String, values: [String] }, { _id: false })], default: [] },
    variants: { type: [variantSchema], default: [] },
    images: { type: [imageSchema], default: [] },
    seo: { title: String, description: String, noindex: Boolean },
    featured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    publishedAt: Date,
    provenance: {
      source: { type: String, enum: ['woocommerce', 'manual'], default: 'manual' },
      wooId: { type: Number, index: true, sparse: true },
      permalink: String,
      importedAt: Date,
    },
    /* ---- denormalised for fast listing/filtering; recomputed in pre-validate ---- */
    priceFrom: { type: Number, default: 0, index: true },
    compareAtFrom: { type: Number, default: null },
    sizes: { type: [String], default: [] },
    colours: { type: [String], default: [] },
    available: { type: Boolean, default: false, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
productSchema.index({ status: 1, collections: 1, publishedAt: -1 });
productSchema.index({ title: 'text', sku: 'text', tags: 'text' }, { weights: { title: 10, sku: 5, tags: 2 } });

export type ProductDoc = InferSchemaType<typeof productSchema>;
export type ProductHydrated = HydratedDocument<ProductDoc>;

const isColourOption = (n: string) => /^colou?r$/i.test(n);
const isSizeOption = (n: string) => /^size$/i.test(n);

export function computeBlockers(p: Pick<ProductDoc, 'images' | 'variants' | 'collections'>): string[] {
  const out: string[] = [];
  const photos = (p.images ?? []).filter((i) => i.kind === 'photo');
  if (!photos.length) out.push((p.images ?? []).length ? 'Only concept images — a verified photograph is required' : 'No product photograph');
  const active = (p.variants ?? []).filter((v) => v.active);
  if (!active.length) out.push('No active variants');
  if (active.some((v) => !(v.price > 0))) out.push('Price missing on an active variant');
  if (active.some((v) => v.stock == null && !v.madeToOrder)) out.push('Stock not entered (or mark made-to-order)');
  if (!(p.collections ?? []).length) out.push('Not assigned to a collection');
  return out;
}

productSchema.pre('validate', function () {
  const active = this.variants.filter((v) => v.active);
  const priced = active.filter((v) => v.price > 0);
  const min = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  this.priceFrom = min?.price ?? 0;
  this.compareAtFrom = min?.compareAtPrice && min.compareAtPrice > min.price ? min.compareAtPrice : null;
  this.available = active.some((v) => v.price > 0 && (v.madeToOrder || (v.stock ?? 0) > 0));
  const sizes = new Set<string>();
  const colours = new Set<string>();
  for (const v of active) {
    for (const [k, val] of v.options as unknown as Map<string, string>) {
      if (isSizeOption(k)) sizes.add(val);
      if (isColourOption(k)) colours.add(val);
    }
  }
  // option declarations also count when a simple product lists values without variants per combination
  for (const o of this.options) {
    if (isSizeOption(o.name ?? '')) o.values.forEach((v) => sizes.add(v));
    if (isColourOption(o.name ?? '')) o.values.forEach((v) => colours.add(v));
  }
  this.sizes = [...sizes];
  this.colours = [...colours];
  this.blockers = computeBlockers(this);
  this.images.forEach((img, i) => {
    if (img.position == null) img.position = i;
  });
});

export const Product = model('Product', productSchema);

const collectionSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    parent: { type: String, default: null },
    description: { type: String, default: '' },
    heroImage: { type: String, default: null },
    active: { type: Boolean, default: false },
    position: { type: Number, default: 0 },
    seo: { title: String, description: String },
    wooId: Number,
  },
  { timestamps: true },
);
export type CollectionDoc = InferSchemaType<typeof collectionSchema>;
export const Collection = model('Collection', collectionSchema);
