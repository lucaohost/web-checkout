import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export type CheckoutItem = { productId: string; quantity: number; unitPriceCents: number };

export function postCheckout(app: FastifyInstance, items: CheckoutItem[], key: string = randomUUID()) {
  return app.inject({
    method: "POST",
    url: "/checkouts",
    headers: { "idempotency-key": key, "x-kiosk-id": "kiosk-1" },
    payload: { items },
  });
}

export function pay(
  app: FastifyInstance,
  checkoutId: string,
  method: "CARD" | "PAY_AT_PICKUP",
  { key = randomUUID(), forceError }: { key?: string; forceError?: string } = {},
) {
  return app.inject({
    method: "POST",
    url: `/checkouts/${checkoutId}/payment`,
    headers: {
      "idempotency-key": key,
      "x-kiosk-id": "kiosk-1",
      ...(forceError ? { "x-force-error": forceError } : {}),
    },
    payload: { method },
  });
}

export async function availabilityOf(app: FastifyInstance, productName: string) {
  const response = await app.inject({ method: "GET", url: "/menu" });
  const products = response
    .json<{ categories: { products: { name: string; availability: string; maxQuantity: number }[] }[] }>()
    .categories.flatMap((category) => category.products);
  const product = products.find((candidate) => candidate.name === productName);
  return product && { availability: product.availability, maxQuantity: product.maxQuantity };
}
