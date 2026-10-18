import type { ChargeResult, PaymentProvider, ProviderContext, ProviderError } from "../../src/payments/payment-provider.ts";

const DECLINE_REASONS = new Set(["declined", "insufficient_funds", "invalid_card"]);

type Charge = { amountCents: number; status: "APPROVED" | "DECLINED"; reason?: string; refunded: boolean };

/** An in-memory payment provider with the payment-mock's semantics, driven by the forwarded X-Force-Error. */
export function createFakePaymentProvider() {
  const charges = new Map<string, Charge>();
  const chargeCalls: { key: string; amountCents: number; context: ProviderContext }[] = [];
  const failNext: ProviderError[] = [];

  const reply = (charge: Charge): ChargeResult =>
    charge.status === "APPROVED" ? { kind: "approved" } : { kind: "declined", reason: charge.reason ?? "declined" };

  const provider: PaymentProvider = {
    async charge({ key, amountCents }, context) {
      chargeCalls.push({ key, amountCents, context });
      const scripted = failNext.shift();
      if (scripted) return { kind: "error", error: scripted };

      const existing = charges.get(key);
      if (existing) return context.forceError === "timeout" ? { kind: "error", error: "timeout" } : reply(existing);

      const forced = context.forceError;
      if (forced === "server_error") return { kind: "error", error: "server_error" };
      const charge: Charge = DECLINE_REASONS.has(forced ?? "")
        ? { amountCents, status: "DECLINED", reason: forced!, refunded: false }
        : { amountCents, status: "APPROVED", refunded: false };
      charges.set(key, charge);
      return forced === "timeout" ? { kind: "error", error: "timeout" } : reply(charge);
    },

    async getStatus(key, context) {
      if (context.forceError === "timeout") return { kind: "error", error: "timeout" };
      const charge = charges.get(key);
      if (!charge) return { kind: "not_found" };
      return charge.status === "APPROVED"
        ? { kind: "approved", refunded: charge.refunded }
        : { kind: "declined", reason: charge.reason ?? "declined" };
    },

    async refund(key, context) {
      if (context.forceError === "server_error" || context.forceError === "timeout") {
        return { kind: "error", error: context.forceError };
      }
      const charge = charges.get(key);
      const refundable = charge?.status === "APPROVED";
      if (refundable) charge.refunded = true;
      return refundable ? { kind: "refunded" } : { kind: "nothing_to_refund" };
    },
  };

  return {
    provider,
    chargeCalls,
    /** The next charges fail with this error before reaching the "provider", charging nothing. */
    failNextCharges(count: number, error: ProviderError) {
      for (let i = 0; i < count; i++) failNext.push(error);
    },
    isRefunded: (key: string) => charges.get(key)?.refunded === true,
  };
}
