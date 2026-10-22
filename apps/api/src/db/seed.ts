import type { Database } from "./client.ts";
import { categories, products } from "./schema.ts";

const MENU = [
  {
    name: "Snacks",
    products: [
      { name: "Coxinha", emoji: "🍗", priceCents: 850, stock: 24 },
      { name: "Cheese bread", emoji: "🧀", priceCents: 600, stock: 40 },
      { name: "Ham & cheese toastie", emoji: "🥪", priceCents: 1400, stock: 12 },
      { name: "Beef empanada", emoji: "🥟", priceCents: 950, stock: 4 },
      { name: "Chicken croquette", emoji: "🥠", priceCents: 650, stock: 22 },
      { name: "Esfiha", emoji: "🫓", priceCents: 800, stock: 20 },
      { name: "French fries", emoji: "🍟", priceCents: 700, stock: 28 },
      { name: "Hot dog", emoji: "🌭", priceCents: 1100, stock: 14 },
      { name: "Kibbeh", emoji: "🥙", priceCents: 750, stock: 16 },
      { name: "Mini pizza", emoji: "🍕", priceCents: 1300, stock: 10 },
    ],
  },
  {
    name: "Sweets",
    products: [
      { name: "Brownie", emoji: "🍫", priceCents: 900, stock: 3 },
      { name: "Brigadeiro", emoji: "🟤", priceCents: 400, stock: 60 },
      { name: "Carrot cake", emoji: "🥕", priceCents: 750, stock: 0 },
      { name: "Beijinho", emoji: "🥥", priceCents: 400, stock: 48 },
      { name: "Churro", emoji: "🍯", priceCents: 650, stock: 18 },
      { name: "Cookie", emoji: "🍪", priceCents: 500, stock: 36 },
      { name: "Donut", emoji: "🍩", priceCents: 600, stock: 24 },
      { name: "Ice cream", emoji: "🍨", priceCents: 900, stock: 12 },
      { name: "Passion fruit mousse", emoji: "🍋", priceCents: 850, stock: 8 },
      { name: "Pudding", emoji: "🍮", priceCents: 700, stock: 15 },
    ],
  },
  {
    name: "Drinks",
    products: [
      { name: "Cola", emoji: "🥤", priceCents: 600, stock: 48 },
      { name: "Guaraná", emoji: "🧃", priceCents: 600, stock: 30 },
      { name: "Orange juice", emoji: "🍊", priceCents: 900, stock: 15 },
      { name: "Water", emoji: "💧", priceCents: 400, stock: 50 },
      { name: "Coffee", emoji: "☕", priceCents: 500, stock: 80 },
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
