import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { resetDatabase, seedProducts } from "./support/database.ts";
import { createFakePaymentProvider } from "./support/fake-payment-provider.ts";
import { availabilityOf, pay, postCheckout } from "./support/kiosk.ts";

const STAFF_KEY = "counter-secret";
const db = createDatabase(inject("databaseUrl"));
let app: FastifyInstance;
let fake: ReturnType<typeof createFakePaymentProvider>;

async function placeOrder(method: "CARD" | "PAY_AT_PICKUP") {
  const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 3 } });
  const checkout = await postCheckout(app, [{ productId: brownie.id, quantity: 2, unitPriceCents: 900 }]);
  const checkoutId = checkout.json<{ checkoutId: string }>().checkoutId;
  const order = await pay(app, checkoutId, method);
  return { checkoutId, orderId: order.json<{ orderId: string }>().orderId };
}

function staff(action: "mark-paid" | "pick-up" | "cancel", orderId: string, key: string | null = STAFF_KEY) {
  return app.inject({
    method: "POST",
    url: `/orders/${orderId}/${action}`,
    headers: key === null ? {} : { "x-staff-key": key },
  });
}

beforeEach(async () => {
  await resetDatabase(db);
  fake = createFakePaymentProvider();
  app = buildApp({
    db,
    paymentProvider: fake.provider,
    config: { staffKey: STAFF_KEY, paymentRetryDelayMs: 0, sweepIntervalMs: 0 },
  });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.$client.end();
});

describe("staff endpoints", () => {
  it("require the staff key", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");

    const missing = await staff("mark-paid", orderId, null);
    const wrong = await staff("mark-paid", orderId, "guess");
    const list = await app.inject({ method: "GET", url: "/orders" });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
  });

  it("take a Pay at Pickup Order through paid at the counter to picked up", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");

    const paid = await staff("mark-paid", orderId);
    const pickedUp = await staff("pick-up", orderId);

    expect(paid.json()).toMatchObject({ status: "PAID" });
    expect(pickedUp.json()).toMatchObject({ status: "PICKED_UP" });
  });

  it("never hand over an Order that was not paid", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");

    const response = await staff("pick-up", orderId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "INVALID_TRANSITION" });
  });

  it("leave final statuses alone", async () => {
    const { orderId } = await placeOrder("CARD");
    await staff("pick-up", orderId);

    const response = await staff("cancel", orderId);

    expect(response.statusCode).toBe(409);
  });

  it("list Orders for the counter, newest first, filtered by status", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");

    const response = await app.inject({
      method: "GET",
      url: "/orders?status=PAYMENT_PENDING",
      headers: { "x-staff-key": STAFF_KEY },
    });
    const missing = await app.inject({
      method: "GET",
      url: `/orders/${randomUUID()}`,
      headers: { "x-staff-key": STAFF_KEY },
    });

    expect(response.json()).toMatchObject({ orders: [{ orderId, status: "PAYMENT_PENDING" }] });
    expect(missing.statusCode).toBe(404);
  });
});

describe("cancelling an Order", () => {
  it("returns every unit to Stock", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 1 });

    const response = await staff("cancel", orderId);

    expect(response.json()).toMatchObject({ status: "CANCELLED" });
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 3 });
  });

  it("refunds the card when the Order was paid by card", async () => {
    const { checkoutId, orderId } = await placeOrder("CARD");

    await staff("cancel", orderId);

    await vi.waitFor(() => expect(fake.isRefunded(`${checkoutId}:1`)).toBe(true));
  });

  it("refunds nothing through the provider when the Order was paid in cash at the counter", async () => {
    const { orderId } = await placeOrder("PAY_AT_PICKUP");
    await staff("mark-paid", orderId);

    await staff("cancel", orderId);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.refundCalls).toEqual([]);
  });
});
