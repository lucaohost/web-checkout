import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type MockOptions } from "../src/app.ts";

const apps: ReturnType<typeof buildApp>[] = [];

function mock(options: Partial<MockOptions> = {}) {
  const app = buildApp({ failureRate: 0, latencyMs: { min: 0, max: 0 }, timeoutDelayMs: 200, slowDelayMs: 50, ...options });
  apps.push(app);
  return app;
}

function charge(app: ReturnType<typeof buildApp>, key: string, amountCents = 1700, forceError?: string) {
  return app.inject({
    method: "POST",
    url: "/payments",
    payload: { key, amountCents },
    headers: forceError ? { "x-force-error": forceError } : {},
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("charges", () => {
  it("approves a charge and reports it by its key", async () => {
    const app = mock();
    const key = randomUUID();

    const response = await charge(app, key);
    const status = await app.inject({ method: "GET", url: `/payments/${key}` });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ key, status: "APPROVED", amountCents: 1700 });
    expect(status.json()).toEqual({ key, status: "APPROVED", amountCents: 1700, refunded: false });
  });

  it("answers a repeated key with the original result instead of charging again", async () => {
    const app = mock();
    const key = randomUUID();
    await charge(app, key, 1700, "declined");

    const repeat = await charge(app, key, 1700);

    expect(repeat.statusCode).toBe(402);
    expect(repeat.json()).toEqual({ key, status: "DECLINED", reason: "declined" });
  });

  it("rejects a key reused for a different amount", async () => {
    const app = mock();
    const key = randomUUID();
    await charge(app, key, 1700);

    const reused = await charge(app, key, 9900);

    expect(reused.statusCode).toBe(422);
  });

  it.each(["declined", "insufficient_funds", "invalid_card"])("declines the charge when forced with %s", async (reason) => {
    const app = mock();
    const key = randomUUID();

    const response = await charge(app, key, 1700, reason);

    expect(response.statusCode).toBe(402);
    expect(response.json()).toEqual({ key, status: "DECLINED", reason });
  });

  it("fails with a server error without charging when forced with server_error", async () => {
    const app = mock();
    const key = randomUUID();

    const response = await charge(app, key, 1700, "server_error");
    const status = await app.inject({ method: "GET", url: `/payments/${key}` });

    expect(response.statusCode).toBe(500);
    expect(status.statusCode).toBe(404);
  });

  it("charges but answers too late when forced with timeout", async () => {
    const app = mock({ timeoutDelayMs: 300 });
    const key = randomUUID();
    const startedAt = Date.now();

    const pendingCharge = charge(app, key, 1700, "timeout");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const status = await app.inject({ method: "GET", url: `/payments/${key}` });
    await pendingCharge;

    expect(status.json()).toMatchObject({ status: "APPROVED" });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(300);
  });

  it("keeps answering too late to repeats while forced with timeout, like a provider that is down", async () => {
    const app = mock({ timeoutDelayMs: 150 });
    const key = randomUUID();
    await charge(app, key, 1700, "timeout");
    const startedAt = Date.now();

    const repeat = await charge(app, key, 1700, "timeout");

    expect(repeat.statusCode).toBe(201);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
  });

  it("approves slowly when forced with slow", async () => {
    const app = mock({ slowDelayMs: 120 });
    const startedAt = Date.now();

    const response = await charge(app, randomUUID(), 1700, "slow");

    expect(response.statusCode).toBe(201);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(120);
  });

  it("fails about 5% of charges at random, the same way for the same seed", async () => {
    const outcomes = async (seed: number) => {
      const app = mock({ failureRate: 0.05, seed, timeoutDelayMs: 0 });
      const results: number[] = [];
      for (let i = 0; i < 400; i++) results.push((await charge(app, randomUUID())).statusCode);
      return results;
    };

    const first = await outcomes(42);
    const second = await outcomes(42);
    const failures = first.filter((statusCode) => statusCode !== 201).length;

    expect(first).toEqual(second);
    expect(failures).toBeGreaterThanOrEqual(8);
    expect(failures).toBeLessThanOrEqual(36);
  });
});

describe("refunds", () => {
  it("refunds an approved charge once, however many times it is asked", async () => {
    const app = mock();
    const key = randomUUID();
    await charge(app, key);

    const first = await app.inject({ method: "POST", url: `/payments/${key}/refund` });
    const second = await app.inject({ method: "POST", url: `/payments/${key}/refund` });
    const status = await app.inject({ method: "GET", url: `/payments/${key}` });

    expect(first.json()).toEqual({ key, status: "REFUNDED" });
    expect(second.json()).toEqual({ key, status: "REFUNDED" });
    expect(status.json()).toMatchObject({ refunded: true });
  });

  it("answers nothing to refund for a charge that never happened or was declined", async () => {
    const app = mock();
    const declinedKey = randomUUID();
    await charge(app, declinedKey, 1700, "declined");

    const never = await app.inject({ method: "POST", url: `/payments/${randomUUID()}/refund` });
    const declined = await app.inject({ method: "POST", url: `/payments/${declinedKey}/refund` });

    expect(never.json()).toMatchObject({ status: "NOTHING_TO_REFUND" });
    expect(declined.json()).toMatchObject({ status: "NOTHING_TO_REFUND" });
  });

  it("fails the refund without refunding when forced with server_error", async () => {
    const app = mock();
    const key = randomUUID();
    await charge(app, key);

    const response = await app.inject({
      method: "POST",
      url: `/payments/${key}/refund`,
      headers: { "x-force-error": "server_error" },
    });
    const status = await app.inject({ method: "GET", url: `/payments/${key}` });

    expect(response.statusCode).toBe(500);
    expect(status.json()).toMatchObject({ refunded: false });
  });
});
