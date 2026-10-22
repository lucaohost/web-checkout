import type { PaymentProvider, ProviderContext, ProviderError } from "./payment-provider.ts";

type CallResult = { ok: true; status: number; body: Record<string, unknown> | undefined } | { ok: false; error: ProviderError };
type Operation = "charge" | "status" | "refund";

function errorFromStatus(status: number): ProviderError {
  return status >= 500 ? "server_error" : "unexpected";
}

function resultLabel(result: CallResult) {
  if (!result.ok) return result.error;
  if (result.status === 201 || result.body?.status === "APPROVED") return "approved";
  if (result.status === 402 || result.body?.status === "DECLINED") return "declined";
  if (result.status === 404) return "not_found";
  if (result.body?.status === "REFUNDED") return "refunded";
  if (result.body?.status === "NOTHING_TO_REFUND") return "nothing_to_refund";
  return `http_${result.status}`;
}

export function createHttpPaymentProvider({
  baseUrl,
  timeoutMs,
  onCall,
}: {
  baseUrl: string;
  timeoutMs: number;
  onCall?: (operation: Operation, result: string, seconds: number) => void;
}): PaymentProvider {
  async function call(
    operation: Operation,
    method: "GET" | "POST",
    path: string,
    context: ProviderContext,
    body?: unknown,
  ): Promise<CallResult> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (context.requestId) headers["x-request-id"] = context.requestId;
    if (context.forceError) headers["x-force-error"] = context.forceError;

    const started = performance.now();
    let result: CallResult;
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      result = { ok: true, status: response.status, body: text ? JSON.parse(text) : undefined };
    } catch (error) {
      result = { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" };
    }
    onCall?.(operation, resultLabel(result), (performance.now() - started) / 1000);
    return result;
  }

  return {
    async charge({ key, amountCents }, context) {
      const result = await call("charge", "POST", "/payments", context, { key, amountCents });
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status === 201) return { kind: "approved" };
      if (result.status === 402) return { kind: "declined", reason: String(result.body?.reason ?? "declined") };
      return { kind: "error", error: errorFromStatus(result.status) };
    },

    async getStatus(key, context) {
      const result = await call("status", "GET", `/payments/${encodeURIComponent(key)}`, context);
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status === 404) return { kind: "not_found" };
      if (result.status !== 200) return { kind: "error", error: errorFromStatus(result.status) };
      if (result.body?.status === "APPROVED") return { kind: "approved", refunded: result.body.refunded === true };
      return { kind: "declined", reason: String(result.body?.reason ?? "declined") };
    },

    async refund(key, context) {
      const result = await call("refund", "POST", `/payments/${encodeURIComponent(key)}/refund`, context);
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status !== 200) return { kind: "error", error: errorFromStatus(result.status) };
      return result.body?.status === "REFUNDED" ? { kind: "refunded" } : { kind: "nothing_to_refund" };
    },
  };
}
