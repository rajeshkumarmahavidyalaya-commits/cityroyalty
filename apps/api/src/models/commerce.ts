import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { DISCOUNT_TYPES, ORDER_STATUSES, PAYMENT_PROVIDERS, PAYMENT_STATUSES, RETURN_STATUSES, SHIPMENT_STATUSES } from '@cityroyalty/shared';

const addressSub = new Schema(
  { fullName: String, phone: String, line1: String, line2: String, city: String, state: String, pin: String, country: { type: String, default: 'IN' } },
  { _id: false },
);

const orderLine = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: Schema.Types.ObjectId, required: true },
  title: String,
  slug: String,
  sku: String,
  optionsLabel: String,
  image: String,
  qty: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  lineTotal: { type: Number, required: true },
  /** true when this line decremented stock (made-to-order lines never do) */
  reserved: { type: Boolean, default: false },
});

const orderSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    lines: { type: [orderLine], required: true },
    subtotal: Number,
    discountTotal: { type: Number, default: 0 },
    discountCode: String,
    shippingTotal: { type: Number, default: 0 },
    codFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    shippingAddress: addressSub,
    billingAddress: addressSub,
    notes: String,
    /** stock for the lines flagged `reserved` is currently held by this order */
    stockReserved: { type: Boolean, default: false },
    discountReserved: { type: Boolean, default: false },
    reservationExpiresAt: { type: Date, index: true },
    idempotencyKey: { type: String, unique: true, sparse: true, select: false },
    flags: { type: [String], default: [] },
    refundedTotal: { type: Number, default: 0 },
    timeline: { type: [new Schema({ at: { type: Date, default: Date.now }, status: String, note: String, by: String }, { _id: false })], default: [] },
    paidAt: Date,
  },
  { timestamps: true },
);
orderSchema.index({ createdAt: -1 });
export type OrderDoc = InferSchemaType<typeof orderSchema>;
export type OrderHydrated = HydratedDocument<OrderDoc>;
export const Order = model('Order', orderSchema);

const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    providerOrderId: { type: String, index: true },
    providerPaymentId: { type: String, index: true },
    amount: Number,
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    /** client-safe params needed to (re)open the provider's hosted checkout */
    clientParams: Schema.Types.Mixed,
    failureReason: String,
    refunds: { type: [new Schema({ at: Date, amount: Number, reason: String, providerRefundId: String, by: String }, { _id: false })], default: [] },
  },
  { timestamps: true },
);
export const Payment = model('Payment', paymentSchema);

/** Idempotency ledger: a provider event id can only be processed once. */
const paymentEventSchema = new Schema(
  {
    eventId: { type: String, required: true },
    provider: { type: String, required: true },
    type: String,
    processed: { type: Boolean, default: false },
    result: String,
  },
  { timestamps: true },
);
paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
export const PaymentEvent = model('PaymentEvent', paymentEventSchema);

const discountSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    /** percent (1–90) or paise */
    value: { type: Number, default: 0 },
    minSubtotal: { type: Number, default: 0 },
    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    startsAt: Date,
    endsAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type DiscountDoc = InferSchemaType<typeof discountSchema>;
export const Discount = model('Discount', discountSchema);

const shipmentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'label_created' },
  },
  { timestamps: true },
);
export const Shipment = model('Shipment', shipmentSchema);

const returnSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: String,
    email: String,
    lines: [{ variantId: Schema.Types.ObjectId, qty: Number, title: String }],
    reason: String,
    status: { type: String, enum: RETURN_STATUSES, default: 'requested', index: true },
    notes: { type: [new Schema({ at: { type: Date, default: Date.now }, status: String, note: String, by: String }, { _id: false })], default: [] },
  },
  { timestamps: true },
);
export const ReturnRequest = model('ReturnRequest', returnSchema);

const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    lines: [{ productId: Schema.Types.ObjectId, variantId: Schema.Types.ObjectId, qty: Number }],
  },
  { timestamps: true },
);
export const Cart = model('Cart', cartSchema);

const wishlistSchema = new Schema(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
  { timestamps: true },
);
export const Wishlist = model('Wishlist', wishlistSchema);

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema);
