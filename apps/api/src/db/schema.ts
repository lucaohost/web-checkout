import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const instant = () => timestamp({ withTimezone: true, mode: "date" });

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  sortOrder: integer().notNull(),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    name: text().notNull(),
    emoji: text().notNull().default(""),
    priceCents: integer().notNull(),
    stock: integer().notNull(),
  },
  (table) => [check("products_stock_not_negative", sql`${table.stock} >= 0`)],
);

export type CheckoutStatus = "ACTIVE" | "PAYING" | "CONSUMED" | "RELEASED";

export const checkouts = pgTable("checkouts", {
  id: uuid().primaryKey().defaultRandom(),
  kioskId: text().notNull(),
  status: text().$type<CheckoutStatus>().notNull(),
  totalCents: integer().notNull(),
  cardChargeUnconfirmed: boolean().notNull().default(false),
  expiresAt: instant().notNull(),
  createdAt: instant().notNull(),
  updatedAt: instant().notNull(),
});

export const checkoutItems = pgTable(
  "checkout_items",
  {
    checkoutId: uuid()
      .notNull()
      .references(() => checkouts.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    position: integer().notNull(),
    quantity: integer().notNull(),
    unitPriceCents: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.checkoutId, table.productId] })],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: uuid().primaryKey(),
  kioskId: text().notNull(),
  route: text().notNull(),
  bodyFingerprint: text().notNull(),
  state: text().$type<"IN_PROGRESS" | "COMPLETED">().notNull(),
  responseStatus: integer(),
  responseBody: jsonb(),
  createdAt: instant().notNull(),
  updatedAt: instant().notNull(),
});
