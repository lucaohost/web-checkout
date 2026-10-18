import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  sortOrder: integer().notNull(),
});

export const products = pgTable("products", {
  id: uuid().primaryKey().defaultRandom(),
  categoryId: uuid()
    .notNull()
    .references(() => categories.id),
  name: text().notNull(),
  emoji: text().notNull().default(""),
  priceCents: integer().notNull(),
  stock: integer().notNull(),
});
