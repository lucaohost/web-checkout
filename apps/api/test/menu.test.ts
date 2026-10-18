import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { categories, products } from "../src/db/schema.ts";

type MenuResponse = {
  categories: {
    name: string;
    products: { name: string; priceCents: number; availability: string; maxQuantity: number }[];
  }[];
};

const db = createDatabase(inject("databaseUrl"));
let app: FastifyInstance;

async function insertCategory(name: string, sortOrder: number) {
  const [category] = await db.insert(categories).values({ name, sortOrder }).returning();
  return category!;
}

async function getMenu(target: FastifyInstance = app) {
  const response = await target.inject({ method: "GET", url: "/menu" });
  return { response, menu: response.json<MenuResponse>() };
}

beforeEach(async () => {
  await db.execute(sql`truncate table products, categories cascade`);
  app = buildApp({ db });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.$client.end();
});

describe("GET /menu", () => {
  it("lists every Product grouped by Category, in Category order", async () => {
    const drinks = await insertCategory("Drinks", 2);
    const snacks = await insertCategory("Snacks", 1);
    await db.insert(products).values([
      { categoryId: drinks.id, name: "Cola", priceCents: 600, stock: 20 },
      { categoryId: snacks.id, name: "Coxinha", priceCents: 850, stock: 20 },
      { categoryId: snacks.id, name: "Brownie", priceCents: 900, stock: 20 },
    ]);

    const { response, menu } = await getMenu();

    expect(response.statusCode).toBe(200);
    expect(
      menu.categories.map((category) => ({
        name: category.name,
        products: category.products.map(({ name, priceCents }) => ({ name, priceCents })),
      })),
    ).toEqual([
      {
        name: "Snacks",
        products: [
          { name: "Brownie", priceCents: 900 },
          { name: "Coxinha", priceCents: 850 },
        ],
      },
      { name: "Drinks", products: [{ name: "Cola", priceCents: 600 }] },
    ]);
  });

  it("tells the Customer each Product's Availability and how many fit in the Cart", async () => {
    const snacks = await insertCategory("Snacks", 1);
    await db.insert(products).values([
      { categoryId: snacks.id, name: "A sold out", priceCents: 100, stock: 0 },
      { categoryId: snacks.id, name: "B three left", priceCents: 100, stock: 3 },
      { categoryId: snacks.id, name: "C five left", priceCents: 100, stock: 5 },
      { categoryId: snacks.id, name: "D six left", priceCents: 100, stock: 6 },
      { categoryId: snacks.id, name: "E plenty", priceCents: 100, stock: 40 },
    ]);

    const { response, menu } = await getMenu();

    expect(menu.categories[0]!.products.map(({ name, availability, maxQuantity }) => ({ name, availability, maxQuantity }))).toEqual([
      { name: "A sold out", availability: "SOLD_OUT", maxQuantity: 0 },
      { name: "B three left", availability: "LAST_UNITS", maxQuantity: 3 },
      { name: "C five left", availability: "LAST_UNITS", maxQuantity: 5 },
      { name: "D six left", availability: "AVAILABLE", maxQuantity: 6 },
      { name: "E plenty", availability: "AVAILABLE", maxQuantity: 10 },
    ]);
    expect(response.body).not.toContain("stock");
  });

  it("serves the cached Menu for 5 minutes while Availability stays live", async () => {
    let now = new Date("2026-10-18T12:00:00Z");
    const cachedApp = buildApp({ db, clock: () => now });
    const snacks = await insertCategory("Snacks", 1);
    const [coxinha] = await db
      .insert(products)
      .values({ categoryId: snacks.id, name: "Coxinha", priceCents: 850, stock: 20 })
      .returning();
    await getMenu(cachedApp);

    await db.update(products).set({ name: "Chicken coxinha", stock: 0 }).where(eq(products.id, coxinha!.id));
    const nameAndAvailability = ({ menu }: { menu: MenuResponse }) =>
      menu.categories[0]!.products.map(({ name, availability }) => ({ name, availability }));

    now = new Date("2026-10-18T12:04:59Z");
    expect(nameAndAvailability(await getMenu(cachedApp))).toEqual([{ name: "Coxinha", availability: "SOLD_OUT" }]);

    now = new Date("2026-10-18T12:05:01Z");
    expect(nameAndAvailability(await getMenu(cachedApp))).toEqual([
      { name: "Chicken coxinha", availability: "SOLD_OUT" },
    ]);
    await cachedApp.close();
  });
});
