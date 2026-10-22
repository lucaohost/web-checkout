import type { Menu } from "../api/client.ts";

export const PRODUCT = {
  coxinha: "11111111-1111-4111-8111-111111111111",
  brownie: "22222222-2222-4222-8222-222222222222",
  carrotCake: "33333333-3333-4333-8333-333333333333",
  cola: "44444444-4444-4444-8444-444444444444",
} as const;

export const menu: Menu = {
  categories: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Snacks",
      products: [
        { id: PRODUCT.coxinha, name: "Coxinha", priceCents: 850, availability: "AVAILABLE", maxQuantity: 10 },
      ],
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Sweets",
      products: [
        { id: PRODUCT.carrotCake, name: "Carrot cake", priceCents: 700, availability: "SOLD_OUT", maxQuantity: 0 },
        { id: PRODUCT.brownie, name: "Brownie", priceCents: 900, availability: "LAST_UNITS", maxQuantity: 2 },
      ],
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Drinks",
      products: [
        { id: PRODUCT.cola, name: "Cola", priceCents: 600, availability: "AVAILABLE", maxQuantity: 10 },
      ],
    },
  ],
};
