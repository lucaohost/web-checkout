import { asc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.ts";
import { categories, products } from "../db/schema.ts";
import { describeAvailability } from "./availability.ts";
import { createCache, MENU_CACHE_TTL_MS } from "./menu-cache.ts";
import { menuSchema } from "./menu-schema.ts";

async function loadMenu(db: Database) {
  const categoryRows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const productRows = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      emoji: products.emoji,
      priceCents: products.priceCents,
    })
    .from(products)
    .orderBy(asc(products.name));

  return categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    products: productRows
      .filter((product) => product.categoryId === category.id)
      .map(({ id, name, emoji, priceCents }) => ({ id, name, emoji, priceCents })),
  }));
}

export function registerMenuRoutes(app: FastifyInstance, { db, clock }: { db: Database; clock: () => Date }) {
  const cachedMenu = createCache({ ttlMs: MENU_CACHE_TTL_MS, clock, load: () => loadMenu(db) });

  app.get("/menu", { schema: menuSchema }, async () => {
    const menu = await cachedMenu();
    const stockRows = await db.select({ id: products.id, stock: products.stock }).from(products);
    const stockById = new Map(stockRows.map((row) => [row.id, row.stock]));

    return {
      categories: menu.map((category) => ({
        ...category,
        products: category.products.map((product) => ({
          ...product,
          ...describeAvailability(stockById.get(product.id) ?? 0),
        })),
      })),
    };
  });
}
