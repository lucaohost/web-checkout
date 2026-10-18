import type { PaymentProvider, ProviderContext, ProviderError } from "./payment-provider.ts";

type CallResult = { ok: true; status: number; body: Record<string, unknown> | undefined } | { ok: false; error: ProviderError };

function errorFromStatus(status: number): ProviderError {
  return status >= 500 ? "server_error" : "unexpected";
}

export function createHttpPaymentProvider({ baseUrl, timeoutMs }: { baseUrl: string; timeoutMs: number }): PaymentProvider {
  async function call(method: "GET" | "POST", path: string, context: ProviderContext, body?: unknown): Promise<CallResult> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (context.requestId) headers["x-request-id"] = context.requestId;
    if (context.forceError) headers["x-force-error"] = context.forceError;

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      return { ok: true, status: response.status, body: text ? JSON.parse(text) : undefined };
    } catch (error) {
      return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" };
    }
  }

  return {
    async charge({ key, amountCents }, context) {
      const result = await call("POST", "/payments", context, { key, amountCents });
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status === 201) return { kind: "approved" };
      if (result.status === 402) return { kind: "declined", reason: String(result.body?.reason ?? "declined") };
      return { kind: "error", error: errorFromStatus(result.status) };
    },

    async getStatus(key, context) {
      const result = await call("GET", `/payments/${encodeURIComponent(key)}`, context);
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status === 404) return { kind: "not_found" };
      if (result.status !== 200) return { kind: "error", error: errorFromStatus(result.status) };
      if (result.body?.status === "APPROVED") return { kind: "approved", refunded: result.body.refunded === true };
      return { kind: "declined", reason: String(result.body?.reason ?? "declined") };
    },

    async refund(key, context) {
      const result = await call("POST", `/payments/${encodeURIComponent(key)}/refund`, context);
      if (!result.ok) return { kind: "error", error: result.error };
      if (result.status !== 200) return { kind: "error", error: errorFromStatus(result.status) };
      return result.body?.status === "REFUNDED" ? { kind: "refunded" } : { kind: "nothing_to_refund" };
    },
  };
}
