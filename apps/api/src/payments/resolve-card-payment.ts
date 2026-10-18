import type { PaymentProvider, ProviderContext } from "./payment-provider.ts";

export type CardOutcome =
  | { kind: "APPROVED" }
  | { kind: "DECLINED"; reason: string }
  | { kind: "FAILED" }
  | { kind: "UNKNOWN" };

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * ADR-0012: a decline is final, a Payment Failure is retried once with the same key,
 * and when the retry fails too the provider's status for that key decides.
 */
export async function resolveCardPayment(
  provider: PaymentProvider,
  charge: { key: string; amountCents: number },
  context: ProviderContext,
  { retryDelayMs }: { retryDelayMs: () => number },
): Promise<CardOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs());
    const result = await provider.charge(charge, context);
    if (result.kind === "approved") return { kind: "APPROVED" };
    if (result.kind === "declined") return { kind: "DECLINED", reason: result.reason };
  }

  const status = await provider.getStatus(charge.key, context);
  switch (status.kind) {
    case "approved":
      return { kind: "APPROVED" };
    case "declined":
      return { kind: "DECLINED", reason: status.reason };
    case "not_found":
      return { kind: "FAILED" };
    case "error":
      return { kind: "UNKNOWN" };
  }
}
