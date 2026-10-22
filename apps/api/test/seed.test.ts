import { eq, sql } from "drizzle-orm";
import { afterAll, expect, inject, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { categories, products } from "../src/db/schema.ts";
import { seedMenuIfEmpty } from "../src/db/seed.ts";

const db = createDatabase(inject("databaseUrl"));

function namesIn(category: string) {
  return db
    .select({ name: products.name })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(categories.name, category));
}

afterAll(async () => {
  await db.$client.end();
});

it("fills an empty database and leaves an existing menu alone", async () => {
  await db.execute(sql`truncate table products, categories cascade`);

  expect(await seedMenuIfEmpty(db)).toBe(true);
  const names = (await db.select({ name: categories.name }).from(categories)).map((row) => row.name).sort();
  expect(names).toEqual(["Drinks", "Snacks", "Sweets"]);
  expect(await namesIn("Snacks")).toHaveLength(10);
  expect(await namesIn("Sweets")).toHaveLength(10);

  expect(await seedMenuIfEmpty(db)).toBe(false);
});
