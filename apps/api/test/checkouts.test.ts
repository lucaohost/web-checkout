import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { resetDatabase, seedProducts } from "./support/database.ts";
import { availabilityOf, postCheckout } from "./support/kiosk.ts";

const db = createDatabase(inject("databaseUrl"));
let app: FastifyInstance;
let now: Date;

beforeEach(async () => {
  await resetDatabase(db);
  now = new Date("2026-10-18T12:00:00Z");
  app = buildApp({ db, clock: () => now });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.$client.end();
});

describe("POST /checkouts", () => {
  it("reserves Stock for the Cart and answers with the total computed by the server", async () => {
    const { coxinha, brownie } = await seedProducts(db, {
      coxinha: { name: "Coxinha", priceCents: 850, stock: 20 },
      brownie: { name: "Brownie", priceCents: 900, stock: 3 },
    });

    const response = await postCheckout(app, [
      { productId: coxinha.id, quantity: 2, unitPriceCents: 850 },
      { productId: brownie.id, quantity: 2, unitPriceCents: 900 },
    ]);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "ACTIVE",
      totalCents: 3500,
      expiresAt: "2026-10-18T12:03:00.000Z",
      items: [
        { productId: coxinha.id, name: "Coxinha", quantity: 2, unitPriceCents: 850 },
        { productId: brownie.id, name: "Brownie", quantity: 2, unitPriceCents: 900 },
      ],
    });
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 1 });
  });

  it("reserves nothing and lists every conflict at once when prices or Stock changed", async () => {
    const { coxinha, brownie, cola, water } = await seedProducts(db, {
      coxinha: { name: "Coxinha", priceCents: 850, stock: 0 },
      brownie: { name: "Brownie", priceCents: 900, stock: 1 },
      cola: { name: "Cola", priceCents: 650, stock: 30 },
      water: { name: "Water", priceCents: 400, stock: 30 },
    });

    const response = await postCheckout(app, [
      { productId: coxinha.id, quantity: 1, unitPriceCents: 850 },
      { productId: brownie.id, quantity: 3, unitPriceCents: 900 },
      { productId: cola.id, quantity: 1, unitPriceCents: 600 },
      { productId: water.id, quantity: 2, unitPriceCents: 400 },
    ]);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "CHECKOUT_CONFLICT",
      message: expect.any(String),
      conflicts: [
        {
          productId: coxinha.id,
          name: "Coxinha",
          reasons: ["SOLD_OUT"],
          requestedQuantity: 1,
          availableQuantity: 0,
          seenUnitPriceCents: 850,
          currentUnitPriceCents: 850,
        },
        {
          productId: brownie.id,
          name: "Brownie",
          reasons: ["NOT_ENOUGH_STOCK"],
          requestedQuantity: 3,
          availableQuantity: 1,
          seenUnitPriceCents: 900,
          currentUnitPriceCents: 900,
        },
        {
          productId: cola.id,
          name: "Cola",
          reasons: ["PRICE_CHANGED"],
          requestedQuantity: 1,
          availableQuantity: 1,
          seenUnitPriceCents: 600,
          currentUnitPriceCents: 650,
        },
      ],
    });
    expect(await availabilityOf(app, "Water")).toEqual({ availability: "AVAILABLE", maxQuantity: 10 });
  });

  it("lets only one of two Kiosks reserve the last unit", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 1 } });
    const item = { productId: brownie.id, quantity: 1, unitPriceCents: 900 };

    const responses = await Promise.all([postCheckout(app, [item]), postCheckout(app, [item])]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "SOLD_OUT", maxQuantity: 0 });
  });

  it("rejects a Cart beyond the per-order limits", async () => {
    const { coxinha } = await seedProducts(db, { coxinha: { name: "Coxinha", priceCents: 850, stock: 50 } });

    const tooMany = await postCheckout(app, [{ productId: coxinha.id, quantity: 11, unitPriceCents: 850 }]);
    const repeated = await postCheckout(app, [
      { productId: coxinha.id, quantity: 1, unitPriceCents: 850 },
      { productId: coxinha.id, quantity: 1, unitPriceCents: 850 },
    ]);

    expect(tooMany.statusCode).toBe(400);
    expect(repeated.statusCode).toBe(400);
  });

  it("rejects unknown fields instead of ignoring them", async () => {
    const { coxinha } = await seedProducts(db, { coxinha: { name: "Coxinha", priceCents: 850, stock: 50 } });

    const response = await app.inject({
      method: "POST",
      url: "/checkouts",
      headers: { "idempotency-key": randomUUID(), "x-kiosk-id": "kiosk-1" },
      payload: { items: [{ productId: coxinha.id, quantity: 1, unitPriceCents: 850 }], totalCents: 1 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("idempotency keys", () => {
  it("replays the original answer for a repeated key and reserves only once", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 4 } });
    const key = randomUUID();
    const items = [{ productId: brownie.id, quantity: 2, unitPriceCents: 900 }];

    const first = await postCheckout(app, items, key);
    const repeat = await postCheckout(app, items, key);

    expect(repeat.statusCode).toBe(201);
    expect(repeat.json()).toEqual(first.json());
    expect(repeat.headers["idempotent-replayed"]).toBe("true");
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 2 });
  });

  it("refuses a key reused for a different request", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 4 } });
    const key = randomUUID();
    await postCheckout(app, [{ productId: brownie.id, quantity: 1, unitPriceCents: 900 }], key);

    const reused = await postCheckout(app, [{ productId: brownie.id, quantity: 2, unitPriceCents: 900 }], key);

    expect(reused.statusCode).toBe(422);
    expect(reused.json()).toMatchObject({ error: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("requires a UUID key on requests that change state", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 4 } });

    const response = await postCheckout(app, [{ productId: brownie.id, quantity: 1, unitPriceCents: 900 }], "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});

describe("Stock Reservation lifecycle", () => {
  it("returns the units to Stock when the Customer cancels", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 2 } });
    const created = await postCheckout(app, [{ productId: brownie.id, quantity: 2, unitPriceCents: 900 }]);

    const cancelled = await app.inject({ method: "DELETE", url: `/checkouts/${created.json().checkoutId}` });
    const cancelledAgain = await app.inject({ method: "DELETE", url: `/checkouts/${created.json().checkoutId}` });

    expect(cancelled.json()).toMatchObject({ status: "RELEASED" });
    expect(cancelledAgain.json()).toMatchObject({ status: "RELEASED" });
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 2 });
  });

  it("returns the units to Stock once an abandoned Checkout passes its 3 minutes", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 2 } });
    const created = await postCheckout(app, [{ productId: brownie.id, quantity: 2, unitPriceCents: 900 }]);

    now = new Date("2026-10-18T12:02:59Z");
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "SOLD_OUT", maxQuantity: 0 });

    now = new Date("2026-10-18T12:03:00Z");
    expect(await availabilityOf(app, "Brownie")).toEqual({ availability: "LAST_UNITS", maxQuantity: 2 });
    const checkout = await app.inject({ method: "GET", url: `/checkouts/${created.json().checkoutId}` });
    expect(checkout.json()).toMatchObject({ status: "RELEASED" });
  });

  it("reports the current state of a Checkout so a Kiosk can recover after losing the connection", async () => {
    const { brownie } = await seedProducts(db, { brownie: { name: "Brownie", priceCents: 900, stock: 2 } });
    const created = await postCheckout(app, [{ productId: brownie.id, quantity: 1, unitPriceCents: 900 }]);

    const checkout = await app.inject({ method: "GET", url: `/checkouts/${created.json().checkoutId}` });
    const missing = await app.inject({ method: "GET", url: `/checkouts/${randomUUID()}` });

    expect(checkout.json()).toMatchObject({ status: "ACTIVE", totalCents: 900, cardAttemptsLeft: 3, cardAllowed: true });
    expect(missing.statusCode).toBe(404);
  });
});