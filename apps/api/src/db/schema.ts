import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

export type PaymentOutcome = "PENDING" | "APPROVED" | "DECLINED" | "FAILED" | "UNKNOWN";

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    checkoutId: uuid()
      .notNull()
      .references(() => checkouts.id),
    attemptNumber: integer().notNull(),
    providerKey: text().notNull().unique(),
    outcome: text().$type<PaymentOutcome>().notNull(),
    detail: text(),
    createdAt: instant().notNull(),
    updatedAt: instant().notNull(),
  },
  (table) => [unique().on(table.checkoutId, table.attemptNumber)],
);

export const orderCodeSequence = pgSequence("order_code_seq", { startWith: 1 });

export type OrderStatus = "PAYMENT_PENDING" | "PAID" | "PICKED_UP" | "CANCELLED";
export type PaymentMethod = "CARD" | "PAY_AT_PICKUP";

export const orders = pgTable("orders", {
  id: uuid().primaryKey().defaultRandom(),
  checkoutId: uuid()
    .notNull()
    .unique()
    .references(() => checkouts.id),
  code: text().notNull(),
  kioskId: text().notNull(),
  status: text().$type<OrderStatus>().notNull(),
  paymentMethod: text().$type<PaymentMethod>().notNull(),
  cardChargeUnconfirmed: boolean().notNull(),
  totalCents: integer().notNull(),
  createdAt: instant().notNull(),
  updatedAt: instant().notNull(),
});

export const orderItems = pgTable(
  "order_items",
  {
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    position: integer().notNull(),
    name: text().notNull(),
    quantity: integer().notNull(),
    unitPriceCents: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.productId] })],
);

export type RefundStatus = "REQUESTED" | "COMPLETED" | "FAILED";

export const refunds = pgTable("refunds", {
  id: uuid().primaryKey().defaultRandom(),
  paymentAttemptId: uuid()
    .notNull()
    .unique()
    .references(() => paymentAttempts.id),
  status: text().$type<RefundStatus>().notNull(),
  tries: integer().notNull().default(0),
  lastError: text(),
  nextTryAt: instant().notNull(),
  createdAt: instant().notNull(),
  updatedAt: instant().notNull(),
});

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
