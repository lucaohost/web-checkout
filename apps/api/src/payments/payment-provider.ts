export type ProviderError = "timeout" | "server_error" | "network" | "unexpected";

export type ChargeResult =
  | { kind: "approved" }
  | { kind: "declined"; reason: string }
  | { kind: "error"; error: ProviderError };

export type StatusResult =
  | { kind: "approved"; refunded: boolean }
  | { kind: "declined"; reason: string }
  | { kind: "not_found" }
  | { kind: "error"; error: ProviderError };

export type RefundResult = { kind: "refunded" } | { kind: "nothing_to_refund" } | { kind: "error"; error: ProviderError };

/** Context carried to the provider: the request id for tracing, and the demo's forced error when ALLOW_FORCE_ERROR is on. */
export type ProviderContext = { requestId?: string; forceError?: string };

export interface PaymentProvider {
  charge(input: { key: string; amountCents: number }, context: ProviderContext): Promise<ChargeResult>;
  getStatus(key: string, context: ProviderContext): Promise<StatusResult>;
  refund(key: string, context: ProviderContext): Promise<RefundResult>;
}
