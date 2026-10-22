import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { conflict } from '../lib/errors';
import { db, type DbOrTx } from '../db';
import { products, variants } from '../db/schema';

export interface StockLine {
  productId: string;
  variantId: string;
  qty: number;
  madeToOrder: boolean;
}

/**
 * Takes stock for every line. The `stock >= qty` condition is evaluated by Postgres in the same statement as
 * the decrement (row lock), so two concurrent buyers can never both take the last unit. Call inside a
 * transaction to make the whole set all-or-nothing.
 */
export async function reserveStock(tx: DbOrTx, lines: StockLine[]): Promise<void> {
  for (const l of lines) {
    if (l.madeToOrder) continue;
    const r = await tx
      .update(variants)
      .set({ stock: sql`${variants.stock} - ${l.qty}` })
      .where(
        and(
          eq(variants.id, l.variantId),
          eq(variants.productId, l.productId),
          eq(variants.active, true),
          gte(variants.stock, l.qty),
          sql`exists (select 1 from ${products} where ${products.id} = ${l.productId} and ${products.status} = 'published')`,
        ),
      )
      .returning({ id: variants.id });
    if (!r.length) throw conflict('Some items just sold out. Please review your bag.', 'insufficient_stock', { variantId: l.variantId });
  }
  await refreshAvailability(tx, lines.map((l) => l.productId));
}

export async function restoreStock(tx: DbOrTx, lines: StockLine[]): Promise<void> {
  for (const l of lines) {
    if (l.madeToOrder) continue;
    await tx.update(variants).set({ stock: sql`coalesce(${variants.stock}, 0) + ${l.qty}` }).where(and(eq(variants.id, l.variantId), eq(variants.productId, l.productId)));
  }
  await refreshAvailability(tx, lines.map((l) => l.productId));
}

/** `available` is denormalised for listing; recompute it in SQL from the current variants. */
export async function refreshAvailability(tx: DbOrTx = db(), productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return;
  await tx
    .update(products)
    .set({
      available: sql`exists (select 1 from ${variants} v where v.product_id = ${products.id} and v.active and v.price > 0 and (v.made_to_order or coalesce(v.stock, 0) > 0))`,
    })
    .where(inArray(products.id, ids));
}
