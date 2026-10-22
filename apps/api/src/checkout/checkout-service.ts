import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { checkoutItems, checkouts, paymentAttempts, products } from "../db/schema.ts";
import { getOrderViewByCheckout } from "../orders/orders.ts";

export const CHECKOUT_TTL_MS = 3 * 60 * 1000;
export const MAX_CARD_ATTEMPTS = 3;

export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CheckoutItemInput = { productId: string; quantity: number; unitPriceCents: number };

export type ConflictReason = "SOLD_OUT" | "NOT_ENOUGH_STOCK" | "PRICE_CHANGED";

export type Conflict = {
  productId: string;
  name: string | null;
  reasons: ConflictReason[];
  requestedQuantity: number;
  availableQuantity: number;
  seenUnitPriceCents: number;
  currentUnitPriceCents: number;
};

class CheckoutConflict extends Error {
  readonly conflicts: Conflict[];

  constructor(conflicts: Conflict[]) {
    super("checkout conflict");
    this.conflicts = conflicts;
  }
}

class ReservationRaceLost extends Error {}

type ProductState = { id: string; name: string; priceCents: number; stock: number };

function findConflicts(items: CheckoutItemInput[], current: ProductState[]): Conflict[] {
  const byId = new Map(current.map((product) => [product.id, product]));
  return items.flatMap((item) => {
    const product = byId.get(item.productId);
    const stock = product?.stock ?? 0;
    const reasons: ConflictReason[] = [];
    if (stock <= 0) reasons.push("SOLD_OUT");
    else if (stock < item.quantity) reasons.push("NOT_ENOUGH_STOCK");
    if (product && product.priceCents !== item.unitPriceCents) reasons.push("PRICE_CHANGED");
    if (reasons.length === 0) return [];
    return [
      {
        productId: item.productId,
        name: product?.name ?? null,
        reasons,
        requestedQuantity: item.quantity,
        availableQuantity: Math.min(item.quantity, stock),
        seenUnitPriceCents: item.unitPriceCents,
        currentUnitPriceCents: product?.priceCents ?? item.unitPriceCents,
      },
    ];
  });
}

function productStates(executor: Executor, items: CheckoutItemInput[]) {
  return executor
    .select({ id: products.id, name: products.name, priceCents: products.priceCents, stock: products.stock })
    .from(products)
    .where(
      inArray(
        products.id,
        items.map((item) => item.productId),
      ),
    );
}

export async function returnStock(executor: Executor, checkoutIds: string[]) {
  if (checkoutIds.length === 0) return;
  const ids = sql.join(
    checkoutIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  await executor.execute(sql`
    update products set stock = products.stock + reserved.quantity
    from (
      select product_id, sum(quantity)::int as quantity
      from checkout_items
      where checkout_id in (${ids})
      group by product_id
    ) as reserved
    where products.id = reserved.product_id
  `);
}

export async function releaseExpiredCheckouts(db: Database, now: Date) {
  await db.transaction(async (tx) => {
    const released = await tx
      .update(checkouts)
      .set({ status: "RELEASED", updatedAt: now })
      .where(and(eq(checkouts.status, "ACTIVE"), lte(checkouts.expiresAt, now)))
      .returning({ id: checkouts.id });
    await returnStock(
      tx,
      released.map((checkout) => checkout.id),
    );
  });
}

async function reserve(db: Database, kioskId: string, items: CheckoutItemInput[], now: Date) {
  return db.transaction(async (tx) => {
    const current = await productStates(tx, items);
    const conflicts = findConflicts(items, current);
    if (conflicts.length > 0) throw new CheckoutConflict(conflicts);

    // Same lock order on every Kiosk, so two Checkouts sharing Products cannot deadlock.
    for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const reserved = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            gte(products.stock, item.quantity),
            eq(products.priceCents, item.unitPriceCents),
          ),
        )
        .returning({ id: products.id });
      if (reserved.length === 0) throw new ReservationRaceLost();
    }

    const priceById = new Map(current.map((product) => [product.id, product.priceCents]));
    const totalCents = items.reduce((total, item) => total + item.quantity * priceById.get(item.productId)!, 0);
    const [checkout] = await tx
      .insert(checkouts)
      .values({
        kioskId,
        status: "ACTIVE",
        totalCents,
        expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: checkouts.id });
    await tx.insert(checkoutItems).values(
      items.map((item, position) => ({
        checkoutId: checkout!.id,
        productId: item.productId,
        position,
        quantity: item.quantity,
        unitPriceCents: priceById.get(item.productId)!,
      })),
    );
    return checkout!.id;
  });
}

export async function createCheckout(
  db: Database,
  { kioskId, items, now }: { kioskId: string; items: CheckoutItemInput[]; now: Date },
): Promise<{ kind: "created"; checkoutId: string } | { kind: "conflict"; conflicts: Conflict[] }> {
  await releaseExpiredCheckouts(db, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { kind: "created", checkoutId: await reserve(db, kioskId, items, now) };
    } catch (error) {
      if (error instanceof CheckoutConflict) return { kind: "conflict", conflicts: error.conflicts };
      if (!(error instanceof ReservationRaceLost)) throw error;
    }
  }
  return { kind: "conflict", conflicts: findConflicts(items, await productStates(db, items)) };
}

export async function cancelCheckout(db: Database, checkoutId: string, now: Date) {
  await db.transaction(async (tx) => {
    const released = await tx
      .update(checkouts)
      .set({ status: "RELEASED", updatedAt: now })
      .where(and(eq(checkouts.id, checkoutId), eq(checkouts.status, "ACTIVE")))
      .returning({ id: checkouts.id });
    await returnStock(
      tx,
      released.map((checkout) => checkout.id),
    );
  });
}

export async function getCheckoutView(db: Database, checkoutId: string) {
  const [checkout] = await db.select().from(checkouts).where(eq(checkouts.id, checkoutId));
  if (!checkout) return undefined;

  const items = await db
    .select({
      productId: checkoutItems.productId,
      name: products.name,
      quantity: checkoutItems.quantity,
      unitPriceCents: checkoutItems.unitPriceCents,
    })
    .from(checkoutItems)
    .innerJoin(products, eq(products.id, checkoutItems.productId))
    .where(eq(checkoutItems.checkoutId, checkoutId))
    .orderBy(asc(checkoutItems.position));

  const [{ attempts } = { attempts: 0 }] = await db
    .select({ attempts: count() })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.checkoutId, checkoutId));
  const cardAttemptsLeft = checkout.cardChargeUnconfirmed ? 0 : Math.max(0, MAX_CARD_ATTEMPTS - attempts);

  return {
    checkoutId: checkout.id,
    status: checkout.status,
    totalCents: checkout.totalCents,
    expiresAt: checkout.expiresAt.toISOString(),
    items,
    cardAttemptsLeft,
    cardAllowed: cardAttemptsLeft > 0,
    order: await getOrderViewByCheckout(db, checkoutId),
  };
}

export type CheckoutView = NonNullable<Awaited<ReturnType<typeof getCheckoutView>>>;
