export const BRAND = {
  name: 'City Royalty',
  tagline: 'Wear a higher standard.',
  currency: 'INR',
  locale: 'en-IN',
} as const;

export const ROLES = ['customer', 'content', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];
/** Roles allowed into the admin dashboard. */
export const STAFF_ROLES: readonly Role[] = ['content', 'manager', 'admin'];

export const PRODUCT_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Five photographic slots per product (brief §2). */
export const IMAGE_SLOTS = ['front', 'back', 'studio', 'detail', 'lifestyle'] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
/** `concept` = AI/concept art: never in a product's gallery or cards, never unlocks publishing; shown only as labelled styling imagery (docs/product-accuracy.md). */
export const IMAGE_KINDS = ['photo', 'concept'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'payment_failed',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['razorpay', 'stripe', 'cod', 'mock'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cod_pending'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPMENT_STATUSES = ['label_created', 'in_transit', 'out_for_delivery', 'delivered', 'returned'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const DISCOUNT_TYPES = ['percent', 'fixed', 'free_shipping'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const SORT_OPTIONS = ['featured', 'newest', 'price-asc', 'price-desc', 'title'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const MAX_QTY_PER_LINE = 10;
