import { Types } from 'mongoose';
import { conflict } from '../lib/errors';
import { Product } from '../models';

export interface StockLine {
  productId: string | Types.ObjectId;
  variantId: string | Types.ObjectId;
  qty: number;
  madeToOrder: boolean;
}

/**
 * Atomically takes stock for every line or none of them.
 * The conditional update (`stock >= qty`) is evaluated by MongoDB in the same operation as the decrement,
 * so two concurrent buyers can never both succeed on the last unit.
 */
export async function reserveStock(lines: StockLine[]): Promise<void> {
  const done: StockLine[] = [];
  try {
    for (const l of lines) {
      if (l.madeToOrder) continue;
      const vid = new Types.ObjectId(String(l.variantId));
      const r = await Product.updateOne(
        { _id: l.productId, status: 'published', variants: { $elemMatch: { _id: vid, active: true, stock: { $gte: l.qty } } } },
        { $inc: { 'variants.$[v].stock': -l.qty } },
        { arrayFilters: [{ 'v._id': vid }] },
      );
      if (r.modifiedCount !== 1) throw conflict('Some items just sold out. Please review your bag.', 'insufficient_stock', { variantId: String(l.variantId) });
      done.push(l);
    }
  } catch (err) {
    await restoreStock(done);
    throw err;
  }
  // keep denormalised availability in sync
  await refreshAvailability(lines.map((l) => String(l.productId)));
}

export async function restoreStock(lines: StockLine[]): Promise<void> {
  for (const l of lines) {
    if (l.madeToOrder) continue;
    const vid = new Types.ObjectId(String(l.variantId));
    await Product.updateOne({ _id: l.productId, 'variants._id': vid }, { $inc: { 'variants.$[v].stock': l.qty } }, { arrayFilters: [{ 'v._id': vid }] });
  }
  await refreshAvailability(lines.map((l) => String(l.productId)));
}

/**
 * `available` is denormalised for listing/filtering. Recompute it from fresh data with a targeted update
 * (a full document save could race with a concurrent stock change).
 */
export async function refreshAvailability(productIds: string[]): Promise<void> {
  for (const id of new Set(productIds)) {
    const p = await Product.findById(id).select('variants').lean();
    if (!p) continue;
    const available = p.variants.some((v) => v.active && v.price > 0 && (v.madeToOrder || (v.stock ?? 0) > 0));
    await Product.updateOne({ _id: id }, { $set: { available } });
  }
}
