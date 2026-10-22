import type { paths } from "./schema";

type JsonResponse<Path extends keyof paths, Method extends keyof paths[Path], Status extends number> =
  paths[Path][Method] extends { responses: { [S in Status]: { content: { "application/json": infer Body } } } }
    ? Body
    : never;

export type Menu = JsonResponse<"/menu", "get", 200>;
export type Category = Menu["categories"][number];
export type Product = Category["products"][number];
export type CheckoutView = JsonResponse<"/checkouts", "post", 201>;
export type CheckoutConflict = JsonResponse<"/checkouts", "post", 409>;
export type Conflict = NonNullable<CheckoutConflict["conflicts"]>[number];
export type OrderView = JsonResponse<"/checkouts/{id}/payment", "post", 201>;
export type PaymentProblem = JsonResponse<"/checkouts/{id}/payment", "post", 402>;
export type PaymentOption = PaymentProblem["options"][number];

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const KIOSK_ID: string = import.meta.env.VITE_KIOSK_ID ?? "kiosk-1";

/** The API's own budget is about 8 s for a payment (ADR-0012); the kiosk waits a little longer. */
const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  readonly status: number;
  readonly body: { error?: string; message?: string } & Record<string, unknown>;

  constructor(status: number, body: unknown) {
    super(`API answered ${status}`);
    this.status = status;
    this.body = (body ?? {}) as ApiError["body"];
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Kiosk-Id", KIOSK_ID);
  headers.set("X-Request-Id", crypto.randomUUID());
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Safe to resend with the same key: the server either never saw it, stored nothing, or is still on it. */
function isWorthRepeating(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  return error.status >= 500 || error.body.error === "REQUEST_IN_PROGRESS";
}

/** ADR-0009: one key per Customer intent; repeats of that intent reuse it. */
export async function sendIntent<T>(
  path: string,
  body: unknown,
  key: string,
  options: { retries?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<T>(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { ...options.headers, "Idempotency-Key": key },
      });
    } catch (error) {
      if (attempt >= retries || !isWorthRepeating(error)) throw error;
      await sleep(700 * (attempt + 1));
    }
  }
}

export function getMenu() {
  return request<Menu>("/menu");
}

export function createCheckout(items: { productId: string; quantity: number; unitPriceCents: number }[], key: string) {
  return sendIntent<CheckoutView>("/checkouts", { items }, key);
}

export function payCheckout(checkoutId: string, method: "CARD" | "PAY_AT_PICKUP", key: string, forceError?: string) {
  return sendIntent<OrderView>(`/checkouts/${checkoutId}/payment`, { method }, key, {
    headers: forceError ? { "X-Force-Error": forceError } : undefined,
  });
}

export function getCheckout(checkoutId: string) {
  return request<CheckoutView>(`/checkouts/${checkoutId}`);
}

export function cancelCheckout(checkoutId: string) {
  return request<CheckoutView>(`/checkouts/${checkoutId}`, { method: "DELETE" });
}
