import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpPaymentProvider } from "../src/payments/http-payment-provider.ts";
import type { PaymentProvider } from "../src/payments/payment-provider.ts";
import { startPaymentMock } from "./support/payment-mock-process.ts";

let mock: Awaited<ReturnType<typeof startPaymentMock>>;
let provider: PaymentProvider;

beforeAll(async () => {
  mock = await startPaymentMock({ TIMEOUT_DELAY_MS: "1500" });
  provider = createHttpPaymentProvider({ baseUrl: mock.baseUrl, timeoutMs: 300 });
});

afterAll(async () => {
  await mock.stop();
});

describe("the HTTP payment provider against the real payment-mock", () => {
  it("charges, reports and refunds a payment by its key", async () => {
    const key = randomUUID();

    const charge = await provider.charge({ key, amountCents: 1700 }, {});
    const statusBefore = await provider.getStatus(key, {});
    const refund = await provider.refund(key, {});
    const refundAgain = await provider.refund(key, {});
    const statusAfter = await provider.getStatus(key, {});

    expect(charge).toEqual({ kind: "approved" });
    expect(statusBefore).toEqual({ kind: "approved", refunded: false });
    expect(refund).toEqual({ kind: "refunded" });
    expect(refundAgain).toEqual({ kind: "refunded" });
    expect(statusAfter).toEqual({ kind: "approved", refunded: true });
  });

  it("passes the decline reason through, from the forced error header", async () => {
    const charge = await provider.charge({ key: randomUUID(), amountCents: 1700 }, { forceError: "insufficient_funds" });

    expect(charge).toEqual({ kind: "declined", reason: "insufficient_funds" });
  });

  it("gives up at its own timeout while the provider still charges", async () => {
    const key = randomUUID();
    const startedAt = Date.now();

    const charge = await provider.charge({ key, amountCents: 1700 }, { forceError: "timeout" });
    const elapsed = Date.now() - startedAt;

    expect(charge).toEqual({ kind: "error", error: "timeout" });
    expect(elapsed).toBeLessThan(1200);
    expect(await provider.getStatus(key, {})).toEqual({ kind: "approved", refunded: false });
  });

  it("reports a server error, after which the charge does not exist", async () => {
    const key = randomUUID();

    const charge = await provider.charge({ key, amountCents: 1700 }, { forceError: "server_error" });

    expect(charge).toEqual({ kind: "error", error: "server_error" });
    expect(await provider.getStatus(key, {})).toEqual({ kind: "not_found" });
  });

  it("records how long each provider call took", async () => {
  const calls: { operation: string; result: string; seconds: number }[] = [];
  const timed = createHttpPaymentProvider({
    baseUrl: mock.baseUrl,
    timeoutMs: 300,
    onCall: (operation, result, seconds) => calls.push({ operation, result, seconds }),
  });

  await timed.charge({ key: randomUUID(), amountCents: 500 }, {});

  expect(calls).toEqual([expect.objectContaining({ operation: "charge", result: "approved" })]);
  expect(calls[0]!.seconds).toBeGreaterThanOrEqual(0);
});

it("reports a network error when the provider is unreachable", async () => {
    const unreachable = createHttpPaymentProvider({ baseUrl: "http://127.0.0.1:1", timeoutMs: 300 });

    expect(await unreachable.charge({ key: randomUUID(), amountCents: 100 }, {})).toEqual({
      kind: "error",
      error: "network",
    });
  });
});
