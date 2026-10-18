import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { resetDatabase, seedProducts } from "./support/database.ts";
import { createFakePaymentProvider } from "./support/fake-payment-provider.ts";
import { availabilityOf, pay, postCheckout } from "./support/kiosk.ts";

const db = createDatabase(inject("databaseUrl"));
let app: FastifyInstance;
let fake: ReturnType<typeof createFakePaymentProvider>;
let now: Date;

function startApp(config: Parameters<typeof buildApp>[0]["config"] = {}) {
  return buildApp({
    db,
    clock: () => now,
    paymentProvider: fake.provider,
    config: { paymentRetryDelayMs: 0, sweepIntervalMs: 20, refundBackoffMs: 1_000, ...config },
  });
}

async function startCheckout() {
  const { coxinha } = await seedProducts(db, { coxinha: { name: "Coxinha", priceCents: 850, stock: 5 } });
  const response = await postCheckout(app, [{ productId: coxinha.id, quantity: 2, unitPriceCents: 850 }]);
  return response.json<{ checkoutId: string }>().checkoutId;
}

beforeEach(async () => {
  await resetDatabase(db);
  now = new Date("2026-10-18T12:00:00Z");
  fake = createFakePaymentProvider();
  app = startApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.$client.end();
});

describe("paying by card", () => {
  it("turns an approved card payment into a Paid Order with a short Order Code", async () => {
    const checkoutId = await startCheckout();

    const response = await pay(app, checkoutId, "CARD");
    const checkout = await app.inject({ method: "GET", url: `/checkouts/${checkoutId}` });

    expect(response.statusCode).toBe(201);
    const order = response.json();
    expect(order).toMatchObject({
      status: "PAID",
      paymentMethod: "CARD",
      totalCents: 1700,
      cardChargeUnconfirmed: false,
      items: [{ name: "Coxinha", quantity: 2, unitPriceCents: 850 }],
    });
    expect(order.code).toMatch(/^[A-Z]-\d{3}$/);
    expect(checkout.json()).toMatchObject({ status: "CONSUMED", order: { code: order.code } });
    expect(fake.chargeCalls.map(({ key, amountCents }) => ({ key, amountCents }))).toEqual([
      { key: `${checkoutId}:1`, amountCents: 1700 },
    ]);
    expect(await availabilityOf(app, "Coxinha")).toEqual({ availability: "LAST_UNITS", maxQuantity: 3 });
  });

  it("keeps the reservation after a decline and offers another card, Pay at Pickup or Cancel", async () => {
    const checkoutId = await startCheckout();

    const response = await pay(app, checkoutId, "CARD", { forceError: "insufficient_funds" });
    const checkout = await app.inject({ method: "GET", url: `/checkouts/${checkoutId}` });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: "PAYMENT_DECLINED",
      reason: "insufficient_funds",
      options: ["TRY_ANOTHER_CARD", "PAY_AT_PICKUP", "CANCEL"],
      cardAttemptsLeft: 2,
    });
    expect(checkout.json()).toMatchObject({ status: "ACTIVE", cardAttemptsLeft: 2, cardAllowed: true });
  });

  it("recovers without the Customer noticing when the automatic retry succeeds", async () => {
    const checkoutId = await startCheckout();
    fake.failNextCharges(1, "timeout");

    const response = await pay(app, checkoutId, "CARD");

    expect(response.statusCode).toBe(201);
    expect(fake.chargeCalls.map(({ key }) => key)).toEqual([`${checkoutId}:1`, `${checkoutId}:1`]);
  });

  it("offers another card after a definitive Payment Failure, since nothing was charged", async () => {
    const checkoutId = await startCheckout();

    const response = await pay(app, checkoutId, "CARD", { forceError: "server_error" });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: "PAYMENT_FAILED",
      options: ["TRY_ANOTHER_CARD", "PAY_AT_PICKUP", "CANCEL"],
    });
  });

  it("charges each new card under a new provider key", async () => {
    const checkoutId = await startCheckout();

    await pay(app, checkoutId, "CARD", { forceError: "declined" });
    const second = await pay(app, checkoutId, "CARD");

    expect(second.statusCode).toBe(201);
    expect(fake.chargeCalls.map(({ key }) => key)).toEqual([`${checkoutId}:1`, `${checkoutId}:2`]);
  });

  it("allows at most three card attempts per Checkout", async () => {
    const checkoutId = await startCheckout();

    await pay(app, checkoutId, "CARD", { forceError: "declined" });
    await pay(app, checkoutId, "CARD", { forceError: "declined" });
    const third = await pay(app, checkoutId, "CARD", { forceError: "declined" });
    const fourth = await pay(app, checkoutId, "CARD");

    expect(third.json()).toMatchObject({ options: ["PAY_AT_PICKUP", "CANCEL"], cardAttemptsLeft: 0 });
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json()).toMatchObject({ error: "CARD_NOT_ALLOWED" });
  });

  it("refunds a charge it cannot confirm and from then on allows only Pay at Pickup", async () => {
    const checkoutId = await startCheckout();

    const unconfirmed = await pay(app, checkoutId, "CARD", { forceError: "timeout" });
    const anotherCard = await pay(app, checkoutId, "CARD");

    expect(unconfirmed.statusCode).toBe(402);
    expect(unconfirmed.json()).toMatchObject({ error: "PAYMENT_UNCONFIRMED", options: ["PAY_AT_PICKUP", "CANCEL"] });
    expect(anotherCard.statusCode).toBe(409);

    // The first refund carries the forced timeout and fails; the background sweep retries after its backoff.
    now = new Date("2026-10-18T12:01:00Z");
    await vi.waitFor(() => expect(fake.isRefunded(`${checkoutId}:1`)).toBe(true), { timeout: 3_000 });

    const pickup = await pay(app, checkoutId, "PAY_AT_PICKUP");
    expect(pickup.json()).toMatchObject({ status: "PAYMENT_PENDING", cardChargeUnconfirmed: true });
  });

  it("replays a repeated payment request instead of charging twice", async () => {
    const checkoutId = await startCheckout();
    const key = randomUUID();

    const first = await pay(app, checkoutId, "CARD", { key });
    const repeat = await pay(app, checkoutId, "CARD", { key });

    expect(repeat.json()).toEqual(first.json());
    expect(fake.chargeCalls).toHaveLength(1);
  });

  it("ignores the forced error header in production", async () => {
    await app.close();
    app = startApp({ forwardForceError: false });
    const checkoutId = await startCheckout();

    const response = await pay(app, checkoutId, "CARD", { forceError: "declined" });

    expect(response.statusCode).toBe(201);
  });
});

describe("paying at pickup", () => {
  it("places a Payment Pending Order without touching the card provider", async () => {
    const checkoutId = await startCheckout();

    const response = await pay(app, checkoutId, "PAY_AT_PICKUP");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "PAYMENT_PENDING",
      paymentMethod: "PAY_AT_PICKUP",
      totalCents: 1700,
      cardChargeUnconfirmed: false,
    });
    expect(fake.chargeCalls).toHaveLength(0);
  });
});

describe("a Checkout that can no longer be paid", () => {
  it("refuses an expired Checkout and gives its Stock back", async () => {
    const checkoutId = await startCheckout();
    now = new Date("2026-10-18T12:03:00Z");

    const response = await pay(app, checkoutId, "CARD");

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: "CHECKOUT_EXPIRED" });
    expect(fake.chargeCalls).toHaveLength(0);
    expect(await availabilityOf(app, "Coxinha")).toEqual({ availability: "LAST_UNITS", maxQuantity: 5 });
  });

  it("cannot be cancelled by the Kiosk once it became an Order", async () => {
    const checkoutId = await startCheckout();
    await pay(app, checkoutId, "CARD");

    const response = await app.inject({ method: "DELETE", url: `/checkouts/${checkoutId}` });

    expect(response.statusCode).toBe(409);
    expect(await availabilityOf(app, "Coxinha")).toEqual({ availability: "LAST_UNITS", maxQuantity: 3 });
  });
});
