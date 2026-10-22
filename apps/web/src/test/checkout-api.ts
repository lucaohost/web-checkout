import { http, HttpResponse, type JsonBodyType } from "msw";
import type { CheckoutView, OrderView } from "../api/client.ts";
import { PRODUCT } from "./fixtures.ts";
import { API_URL, server } from "./server.ts";

export const CHECKOUT_ID = "99999999-9999-4999-8999-999999999999";

export function checkoutView(overrides: Partial<CheckoutView> = {}): CheckoutView {
  return {
    checkoutId: CHECKOUT_ID,
    status: "ACTIVE",
    totalCents: 1700,
    expiresAt: "2026-10-18T12:03:00.000Z",
    items: [{ productId: PRODUCT.coxinha, name: "Coxinha", emoji: "🍗", quantity: 2, unitPriceCents: 850 }],
    cardAttemptsLeft: 3,
    cardAllowed: true,
    order: null,
    ...overrides,
  };
}

export function orderView(overrides: Partial<OrderView> = {}): OrderView {
  return {
    orderId: "88888888-8888-4888-8888-888888888888",
    code: "A-042",
    status: "PAID",
    paymentMethod: "CARD",
    totalCents: 1700,
    cardChargeUnconfirmed: false,
    createdAt: "2026-10-18T12:01:00.000Z",
    items: [{ productId: PRODUCT.coxinha, name: "Coxinha", emoji: "🍗", quantity: 2, unitPriceCents: 850 }],
    ...overrides,
  };
}

export type RecordedRequest = {
  method: string;
  path: string;
  key: string | null;
  forceError: string | null;
  body: unknown;
};

export type ScriptedResponse = { status: number; body: JsonBodyType } | "network-error";

function reply(next: ScriptedResponse) {
  return next === "network-error" ? HttpResponse.error() : HttpResponse.json(next.body, { status: next.status });
}

function take(queue: ScriptedResponse[]) {
  return queue.length > 1 ? queue.shift()! : queue[0]!;
}

/** Records every checkout call the kiosk makes, answering each in turn from the given responses. */
export function serveCheckout({
  checkouts = [{ status: 201, body: checkoutView() }],
  payments = [{ status: 201, body: orderView() }],
  reads = [{ status: 200, body: checkoutView() }],
}: {
  checkouts?: ScriptedResponse[] | "network-error-then-created";
  payments?: ScriptedResponse[];
  reads?: ScriptedResponse[];
} = {}) {
  const requests: RecordedRequest[] = [];
  const record = async (request: Request) => {
    const text = await request.clone().text();
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      key: request.headers.get("Idempotency-Key"),
      forceError: request.headers.get("X-Force-Error"),
      body: text ? JSON.parse(text) : undefined,
    });
  };

  const checkoutQueue = checkouts === "network-error-then-created" ? undefined : [...checkouts];
  let checkoutCalls = 0;
  const paymentQueue = [...payments];
  const readQueue = [...reads];

  server.use(
    http.post(`${API_URL}/checkouts`, async ({ request }) => {
      await record(request);
      checkoutCalls++;
      if (!checkoutQueue) return checkoutCalls === 1 ? HttpResponse.error() : HttpResponse.json(checkoutView(), { status: 201 });
      return reply(take(checkoutQueue));
    }),
    http.post(`${API_URL}/checkouts/:id/payment`, async ({ request }) => {
      await record(request);
      return reply(take(paymentQueue));
    }),
    http.get(`${API_URL}/checkouts/:id`, async ({ request }) => {
      await record(request);
      return reply(take(readQueue));
    }),
    http.delete(`${API_URL}/checkouts/:id`, async ({ request }) => {
      await record(request);
      return HttpResponse.json(checkoutView({ status: "RELEASED" }));
    }),
  );
  return requests;
}
