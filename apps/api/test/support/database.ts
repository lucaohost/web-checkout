import { sql } from "drizzle-orm";
import type { Database } from "../../src/db/client.ts";
import { categories, products } from "../../src/db/schema.ts";

export async function resetDatabase(db: Database) {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((row) => `"${row.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}

type ProductSeed = { name: string; priceCents: number; stock: number };

export async function seedProducts<const Seeds extends Record<string, ProductSeed>>(db: Database, seeds: Seeds) {
  const [category] = await db.insert(categories).values({ name: "Snacks", sortOrder: 1 }).returning();
  const entries = Object.entries(seeds) as [keyof Seeds, ProductSeed][];
  const rows = await db
    .insert(products)
    .values(entries.map(([, seed]) => ({ ...seed, categoryId: category!.id })))
    .returning();
  return Object.fromEntries(entries.map(([alias], index) => [alias, rows[index]!])) as {
    [Alias in keyof Seeds]: (typeof rows)[number];
  };
}
