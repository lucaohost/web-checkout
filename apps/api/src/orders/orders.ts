import { asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../checkout/checkout-service.ts";
import type { Database } from "../db/client.ts";
import { checkoutItems, type OrderStatus, orderItems, orders, type PaymentMethod, products } from "../db/schema.ts";

/** A-001 … A-999, then B-001: short enough to read out at the counter. */
export function formatOrderCode(sequence: number) {
  const letter = String.fromCharCode(65 + (Math.floor((sequence - 1) / 999) % 26));
  const number = ((sequence - 1) % 999) + 1;
  return `${letter}-${String(number).padStart(3, "0")}`;
}

export async function createOrderFromCheckout(
  tx: Executor,
  checkout: { id: string; kioskId: string; totalCents: number; cardChargeUnconfirmed: boolean },
  { status, paymentMethod, now }: { status: OrderStatus; paymentMethod: PaymentMethod; now: Date },
) {
  const sequence = await tx.execute<{ value: string }>(sql`select nextval('order_code_seq') as value`);
  const [order] = await tx
    .insert(orders)
    .values({
      checkoutId: checkout.id,
      code: formatOrderCode(Number(sequence.rows[0]!.value)),
      kioskId: checkout.kioskId,
      status,
      paymentMethod,
      cardChargeUnconfirmed: checkout.cardChargeUnconfirmed,
      totalCents: checkout.totalCents,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: orders.id });

  const items = await tx
    .select({
      productId: checkoutItems.productId,
      position: checkoutItems.position,
      name: products.name,
      emoji: products.emoji,
      quantity: checkoutItems.quantity,
      unitPriceCents: checkoutItems.unitPriceCents,
    })
    .from(checkoutItems)
    .innerJoin(products, eq(products.id, checkoutItems.productId))
    .where(eq(checkoutItems.checkoutId, checkout.id));
  await tx.insert(orderItems).values(items.map((item) => ({ ...item, orderId: order!.id })));
  return order!.id;
}

async function viewOf(db: Database, order: typeof orders.$inferSelect) {
  const items = await db
    .select({
      productId: orderItems.productId,
      name: orderItems.name,
      emoji: orderItems.emoji,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.position));
  return {
    orderId: order.id,
    code: order.code,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalCents: order.totalCents,
    cardChargeUnconfirmed: order.cardChargeUnconfirmed,
    createdAt: order.createdAt.toISOString(),
    items,
  };
}

export async function getOrderView(db: Database, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  return order && viewOf(db, order);
}

export async function getOrderViewByCheckout(db: Database, checkoutId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.checkoutId, checkoutId));
  return order ? viewOf(db, order) : null;
}

export type OrderView = NonNullable<Awaited<ReturnType<typeof getOrderView>>>;
