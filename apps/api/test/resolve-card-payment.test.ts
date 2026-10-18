import { describe, expect, it } from "vitest";
import type { ChargeResult, PaymentProvider, StatusResult } from "../src/payments/payment-provider.ts";
import { resolveCardPayment } from "../src/payments/resolve-card-payment.ts";

function scriptedProvider(charges: ChargeResult[], statuses: StatusResult[] = []) {
  const chargedKeys: string[] = [];
  const statusKeys: string[] = [];
  const provider: PaymentProvider = {
    async charge({ key }) {
      chargedKeys.push(key);
      return charges.shift() ?? { kind: "error", error: "unexpected" };
    },
    async getStatus(key) {
      statusKeys.push(key);
      return statuses.shift() ?? { kind: "error", error: "unexpected" };
    },
    async refund() {
      return { kind: "refunded" };
    },
  };
  return { provider, chargedKeys, statusKeys };
}

const timeout: ChargeResult = { kind: "error", error: "timeout" };
const serverError: ChargeResult = { kind: "error", error: "server_error" };

function resolve(provider: PaymentProvider) {
  return resolveCardPayment(provider, { key: "checkout-1:1", amountCents: 1700 }, {}, { retryDelayMs: () => 0 });
}

describe("resolving a card Payment Attempt", () => {
  it("is approved when the first charge is approved", async () => {
    const { provider, chargedKeys } = scriptedProvider([{ kind: "approved" }]);

    expect(await resolve(provider)).toEqual({ kind: "APPROVED" });
    expect(chargedKeys).toEqual(["checkout-1:1"]);
  });

  it("is declined without retrying, because a decline is the issuer's answer", async () => {
    const { provider, chargedKeys } = scriptedProvider([{ kind: "declined", reason: "insufficient_funds" }]);

    expect(await resolve(provider)).toEqual({ kind: "DECLINED", reason: "insufficient_funds" });
    expect(chargedKeys).toHaveLength(1);
  });

  it("retries a Payment Failure once with the same provider key", async () => {
    const { provider, chargedKeys } = scriptedProvider([timeout, { kind: "approved" }]);

    expect(await resolve(provider)).toEqual({ kind: "APPROVED" });
    expect(chargedKeys).toEqual(["checkout-1:1", "checkout-1:1"]);
  });

  it.each<[string, StatusResult, unknown]>([
    ["approved", { kind: "approved", refunded: false }, { kind: "APPROVED" }],
    ["declined", { kind: "declined", reason: "invalid_card" }, { kind: "DECLINED", reason: "invalid_card" }],
    ["not found, so nothing was charged", { kind: "not_found" }, { kind: "FAILED" }],
    ["unreachable", { kind: "error", error: "timeout" }, { kind: "UNKNOWN" }],
  ])("asks the provider after the retry also fails, and the status is %s", async (_label, status, expected) => {
    const { provider, chargedKeys, statusKeys } = scriptedProvider([timeout, serverError], [status]);

    expect(await resolve(provider)).toEqual(expected);
    expect(chargedKeys).toHaveLength(2);
    expect(statusKeys).toEqual(["checkout-1:1"]);
  });
});
