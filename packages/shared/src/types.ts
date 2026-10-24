import type {
  ImageKind,
  ImageSlot,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  ReturnStatus,
  Role,
  ShipmentStatus,
} from './constants';

/* DTOs returned by the API. Dates are ISO strings on the wire. */

export interface ImageSource {
  /** width in px */
  w: number;
  url: string;
}
export interface ImageDTO {
  id: string;
  slot: ImageSlot;
  kind: ImageKind;
  alt: string;
  colour?: string;
  width: number;
  height: number;
  /** Fallback (WebP) URL at the largest size. */
  src: string;
  avif: ImageSource[];
  webp: ImageSource[];
  /** tiny base64 WebP for blur-up */
  blur?: string;
}

export interface VariantDTO {
  id: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  /** null → unknown. `available` is the only stock signal the UI should use. */
  available: boolean;
  /** Only populated when ≤ 5 units remain (real number, not a marketing label). */
  lowStock: number | null;
  madeToOrder: boolean;
}

export interface ProductOptionDTO {
  name: string;
  values: string[];
}

export interface ProductCardDTO {
  id: string;
  slug: string;
  title: string;
  priceFrom: number;
  compareAtFrom: number | null;
  /** Colours with a representative image so cards can show swatches. */
  colours: string[];
  sizes: string[];
  image: ImageDTO | null;
  hoverImage: ImageDTO | null;
  /** First styling (concept) image, for editorial placements that label it; `image` stays the real photograph. */
  styledImage: ImageDTO | null;
  available: boolean;
  featured: boolean;
  collections: string[];
  publishedAt: string | null;
}

export interface ProductDTO extends ProductCardDTO {
  sku: string;
  description: string;
  highlights: string[];
  material?: string;
  care?: string;
  options: ProductOptionDTO[];
  variants: VariantDTO[];
  images: ImageDTO[];
  /** Styling imagery (concept art of a similar look). Never part of the gallery; shown in a labelled section. */
  styling: ImageDTO[];
  seo: { title?: string; description?: string; noindex?: boolean };
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface FacetsDTO {
  sizes: string[];
  colours: string[];
  materials: string[];
  price: { min: number; max: number };
}

export interface CollectionDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  parent: string | null;
  heroImage: string | null;
  count: number;
  seo: { title?: string; description?: string };
}

export interface ArticleDTO {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImage: string | null;
  tags: string[];
  publishedAt: string | null;
  seo: { title?: string; description?: string };
}

export interface PageDTO {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface CampaignDTO {
  key: string;
  headline: string;
  subline: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
  imageAlt: string;
}

export interface PublicSettingsDTO {
  storeName: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
  social: { instagram?: string; facebook?: string };
  shipping: { freeThreshold: number | null; estimate?: string; codEnabled: boolean };
  tax: { pricesIncludeTax: boolean; note?: string };
  returns: { windowDays: number | null; summary?: string };
  brandFacts: string[];
  paymentProviders: PaymentProvider[];
  razorpayKeyId?: string;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
}

export interface AddressDTO {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pin: string;
  country: string;
  isDefault: boolean;
}

export interface PricedLineDTO {
  productId: string;
  variantId: string;
  qty: number;
  title: string;
  slug: string;
  sku: string;
  optionsLabel: string;
  image: ImageDTO | null;
  unitPrice: number;
  compareAt: number | null;
  lineTotal: number;
  /** max the customer can buy right now (null = no cap, made-to-order) */
  maxQty: number | null;
  issue?: 'unavailable' | 'insufficient_stock' | 'removed';
}

export interface PricedCartDTO {
  lines: PricedLineDTO[];
  subtotal: number;
  discount: { code: string; amount: number; description: string } | null;
  discountError?: string;
  shipping: number | null;
  shippingNote?: string;
  total: number | null;
  currency: 'INR';
  ok: boolean;
}

export interface OrderLineDTO {
  variantId: string;
  title: string;
  sku: string;
  optionsLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  image?: string;
}

export interface ShipmentDTO {
  id: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  number: string;
  email: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  provider: PaymentProvider;
  lines: OrderLineDTO[];
  subtotal: number;
  discountTotal: number;
  discountCode?: string;
  shippingTotal: number;
  total: number;
  shippingAddress: Omit<AddressDTO, 'id' | 'isDefault'>;
  shipments: ShipmentDTO[];
  timeline: { at: string; status: string; note?: string }[];
  createdAt: string;
  reservationExpiresAt?: string;
}

export interface CheckoutResultDTO {
  order: { number: string; total: number; accessToken: string };
  payment:
    | { provider: 'razorpay'; keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: { name: string; email: string; contact: string } }
    | { provider: 'stripe'; clientSecret: string; publishableKey: string }
    | { provider: 'mock'; mockPaymentId: string }
    | { provider: 'cod' };
}

export interface ReturnDTO {
  id: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export type { ProductStatus };
