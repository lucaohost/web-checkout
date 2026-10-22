import type { Database } from "./client.ts";
import { categories, products } from "./schema.ts";

const MENU = [
  {
    name: "Snacks",
    products: [
      { name: "Coxinha", priceCents: 850, stock: 24 },
      { name: "Cheese bread", priceCents: 600, stock: 40 },
      { name: "Ham & cheese toastie", priceCents: 1400, stock: 12 },
      { name: "Beef empanada", priceCents: 950, stock: 4 },
      { name: "Chicken croquette", priceCents: 650, stock: 22 },
      { name: "Esfiha", priceCents: 800, stock: 20 },
      { name: "French fries", priceCents: 700, stock: 28 },
      { name: "Hot dog", priceCents: 1100, stock: 14 },
      { name: "Kibbeh", priceCents: 750, stock: 16 },
      { name: "Mini pizza", priceCents: 1300, stock: 10 },
    ],
  },
  {
    name: "Sweets",
    products: [
      { name: "Brownie", priceCents: 900, stock: 3 },
      { name: "Brigadeiro", priceCents: 400, stock: 60 },
      { name: "Carrot cake", priceCents: 750, stock: 0 },
      { name: "Beijinho", priceCents: 400, stock: 48 },
      { name: "Churro", priceCents: 650, stock: 18 },
      { name: "Cookie", priceCents: 500, stock: 36 },
      { name: "Donut", priceCents: 600, stock: 24 },
      { name: "Ice cream", priceCents: 900, stock: 12 },
      { name: "Passion fruit mousse", priceCents: 850, stock: 8 },
      { name: "Pudding", priceCents: 700, stock: 15 },
    ],
  },
  {
    name: "Drinks",
    products: [
      { name: "Cola", priceCents: 600, stock: 48 },
      { name: "Guaraná", priceCents: 600, stock: 30 },
      { name: "Orange juice", priceCents: 900, stock: 15 },
      { name: "Water", priceCents: 400, stock: 50 },
      { name: "Coffee", priceCents: 500, stock: 80 },
    ],
  },
];

export async function seedMenuIfEmpty(db: Database) {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing.length > 0) return false;

  await db.transaction(async (tx) => {
    for (const [index, category] of MENU.entries()) {
      const [row] = await tx.insert(categories).values({ name: category.name, sortOrder: index + 1 }).returning();
      await tx.insert(products).values(category.products.map((product) => ({ ...product, categoryId: row!.id })));
    }
  });
  return true;
}
