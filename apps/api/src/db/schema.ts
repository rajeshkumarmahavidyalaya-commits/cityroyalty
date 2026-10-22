import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Everything lives in the `cr` schema. It is not exposed through Supabase's Data API (PostgREST),
 * so the tables are reachable only through this service's own connection.
 */
export const cr = pgSchema('cr');

const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

export interface Seo {
  title?: string;
  description?: string;
  noindex?: boolean;
}
export interface ImageSourceRow {
  w: number;
  url: string;
}
export interface AddressJson {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pin: string;
  country?: string;
}
export interface TimelineEntry {
  at: string;
  status: string;
  note?: string;
  by?: string;
}

export const users = cr.table('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('customer'),
  phone: text('phone'),
  tokenVersion: integer('token_version').notNull().default(0),
  resetTokenHash: text('reset_token_hash'),
  resetExpires: timestamp('reset_expires', { withTimezone: true }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

export const addresses = cr.table(
  'addresses',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2').notNull().default(''),
    city: text('city').notNull(),
    state: text('state').notNull(),
    pin: text('pin').notNull(),
    country: text('country').notNull().default('IN'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: created(),
  },
  (t) => [index('addresses_user_idx').on(t.userId)],
);

export const assets = cr.table('assets', {
  id: id(),
  key: text('key').notNull().unique(),
  originalName: text('original_name'),
  sourceUrl: text('source_url'),
  width: integer('width'),
  height: integer('height'),
  bytes: integer('bytes'),
  src: text('src'),
  avif: jsonb('avif').$type<ImageSourceRow[]>().notNull().default([]),
  webp: jsonb('webp').$type<ImageSourceRow[]>().notNull().default([]),
  blur: text('blur'),
  createdAt: created(),
});

export const collections = cr.table('collections', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  parent: text('parent'),
  description: text('description').notNull().default(''),
  heroImage: text('hero_image'),
  active: boolean('active').notNull().default(false),
  position: integer('position').notNull().default(0),
  seo: jsonb('seo').$type<Seo>().notNull().default({}),
  wooId: integer('woo_id'),
  createdAt: created(),
  updatedAt: updated(),
});

export const products = cr.table(
  'products',
  {
    id: id(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    sku: text('sku').notNull(),
    status: text('status').notNull().default('draft'),
    blockers: textArray('blockers'),
    description: text('description').notNull().default(''),
    highlights: textArray('highlights'),
    material: text('material'),
    materialKey: text('material_key'),
    care: text('care'),
    collections: textArray('collections'),
    tags: textArray('tags'),
    options: jsonb('options').$type<{ name: string; values: string[] }[]>().notNull().default([]),
    seo: jsonb('seo').$type<Seo>().notNull().default({}),
    featured: boolean('featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    provenance: jsonb('provenance').$type<{ source: 'woocommerce' | 'manual'; wooId?: number; permalink?: string; importedAt?: string }>().notNull().default({ source: 'manual' }),
    wooId: integer('woo_id').unique(),
    // ---- denormalised for listing/filtering; recomputed by services/products.ts refreshProduct()
    priceFrom: integer('price_from').notNull().default(0),
    compareAtFrom: integer('compare_at_from'),
    sizes: textArray('sizes'),
    colours: textArray('colours'),
    available: boolean('available').notNull().default(false),
    updatedBy: uuid('updated_by'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('products_status_idx').on(t.status, t.publishedAt), index('products_collections_idx').using('gin', t.collections), index('products_price_idx').on(t.priceFrom)],
);

export const variants = cr.table(
  'variants',
  {
    id: id(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    options: jsonb('options').$type<Record<string, string>>().notNull().default({}),
    price: integer('price').notNull(),
    compareAtPrice: integer('compare_at_price'),
    /** null = unknown → cannot be sold */
    stock: integer('stock'),
    madeToOrder: boolean('made_to_order').notNull().default(false),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('variants_product_idx').on(t.productId)],
);

export const productImages = cr.table(
  'product_images',
  {
    id: id(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    kind: text('kind').notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    alt: text('alt').notNull(),
    colour: text('colour'),
    position: integer('position').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    src: text('src'),
    avif: jsonb('avif').$type<ImageSourceRow[]>().notNull().default([]),
    webp: jsonb('webp').$type<ImageSourceRow[]>().notNull().default([]),
    blur: text('blur'),
  },
  (t) => [index('images_product_idx').on(t.productId)],
);

export const discounts = cr.table('discounts', {
  id: id(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(),
  value: integer('value').notNull().default(0),
  minSubtotal: integer('min_subtotal').notNull().default(0),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const orders = cr.table(
  'orders',
  {
    id: id(),
    number: text('number').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    status: text('status').notNull().default('pending_payment'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    provider: text('provider').notNull(),
    subtotal: integer('subtotal').notNull(),
    discountTotal: integer('discount_total').notNull().default(0),
    discountCode: text('discount_code'),
    shippingTotal: integer('shipping_total').notNull().default(0),
    codFee: integer('cod_fee').notNull().default(0),
    total: integer('total').notNull(),
    currency: text('currency').notNull().default('INR'),
    shippingAddress: jsonb('shipping_address').$type<AddressJson>().notNull(),
    billingAddress: jsonb('billing_address').$type<AddressJson>(),
    notes: text('notes'),
    /** stock for lines flagged `reserved` is currently held by this order */
    stockReserved: boolean('stock_reserved').notNull().default(false),
    discountReserved: boolean('discount_reserved').notNull().default(false),
    reservationExpiresAt: timestamp('reservation_expires_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').unique(),
    flags: textArray('flags'),
    refundedTotal: integer('refunded_total').notNull().default(0),
    timeline: jsonb('timeline').$type<TimelineEntry[]>().notNull().default([]),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('orders_email_idx').on(t.email), index('orders_status_idx').on(t.status), index('orders_created_idx').on(t.createdAt), index('orders_expiry_idx').on(t.reservationExpiresAt)],
);

export const orderLines = cr.table(
  'order_lines',
  {
    id: id(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    title: text('title').notNull(),
    slug: text('slug'),
    sku: text('sku'),
    optionsLabel: text('options_label').notNull().default(''),
    image: text('image'),
    qty: integer('qty').notNull(),
    unitPrice: integer('unit_price').notNull(),
    lineTotal: integer('line_total').notNull(),
    /** true when this line decremented stock (made-to-order lines never do) */
    reserved: boolean('reserved').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId), index('order_lines_product_idx').on(t.productId)],
);

export const payments = cr.table(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    amount: integer('amount').notNull(),
    status: text('status').notNull().default('pending'),
    clientParams: jsonb('client_params'),
    failureReason: text('failure_reason'),
    refunds: jsonb('refunds').$type<{ at: string; amount: number; reason: string; providerRefundId: string; by: string }[]>().notNull().default([]),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('payments_order_idx').on(t.orderId), index('payments_provider_order_idx').on(t.provider, t.providerOrderId)],
);

/** Idempotency ledger: a provider event id is processed once. */
export const paymentEvents = cr.table(
  'payment_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type'),
    processed: boolean('processed').notNull().default(false),
    result: text('result'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('payment_events_unique').on(t.provider, t.eventId)],
);

export const shipments = cr.table(
  'shipments',
  {
    id: id(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    carrier: text('carrier').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    trackingUrl: text('tracking_url'),
    status: text('status').notNull().default('label_created'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('shipments_order_idx').on(t.orderId)],
);

export const returns = cr.table('returns', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  orderNumber: text('order_number').notNull(),
  email: text('email').notNull(),
  lines: jsonb('lines').$type<{ variantId: string; qty: number; title?: string }[]>().notNull().default([]),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('requested'),
  notes: jsonb('notes').$type<TimelineEntry[]>().notNull().default([]),
  createdAt: created(),
  updatedAt: updated(),
});

export const carts = cr.table('carts', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  lines: jsonb('lines').$type<{ productId: string; variantId: string; qty: number }[]>().notNull().default([]),
  updatedAt: updated(),
});

export const wishlists = cr.table('wishlists', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  productIds: textArray('product_ids'),
  updatedAt: updated(),
});

export const articles = cr.table('articles', {
  id: id(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt').notNull().default(''),
  body: text('body').notNull().default(''),
  coverImage: text('cover_image'),
  tags: textArray('tags'),
  status: text('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  seo: jsonb('seo').$type<Seo>().notNull().default({}),
  wooId: integer('woo_id'),
  createdAt: created(),
  updatedAt: updated(),
});

export const pages = cr.table('pages', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  status: text('status').notNull().default('published'),
  seo: jsonb('seo').$type<Seo>().notNull().default({}),
  wooId: integer('woo_id'),
  createdAt: created(),
  updatedAt: updated(),
});

export const campaigns = cr.table('campaigns', {
  id: id(),
  key: text('key').notNull().unique(),
  headline: text('headline').notNull().default(''),
  subline: text('subline').notNull().default(''),
  ctaLabel: text('cta_label').notNull().default(''),
  ctaHref: text('cta_href').notNull().default(''),
  image: text('image'),
  imageAlt: text('image_alt').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const subscribers = cr.table('subscribers', {
  id: id(),
  email: text('email').notNull().unique(),
  source: text('source'),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  createdAt: created(),
});

export const settings = cr.table('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updated(),
});

export const auditLogs = cr.table(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    summary: text('summary'),
    meta: jsonb('meta'),
    ip: text('ip'),
    createdAt: created(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt), index('audit_action_idx').on(t.action)],
);

export type UserRow = typeof users.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type VariantRow = typeof variants.$inferSelect;
export type ImageRow = typeof productImages.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type DiscountRow = typeof discounts.$inferSelect;
export type ShipmentRow = typeof shipments.$inferSelect;
