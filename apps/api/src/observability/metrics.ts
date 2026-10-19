import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

export function createMetrics() {
  const register = new Registry();
  collectDefaultMetrics({ register });

  const httpDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "API request duration, excluding work done after the reply is sent",
    labelNames: ["method", "route", "status"],
    buckets: [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
    registers: [register],
  });

  const orders = new Counter({
    name: "orders_placed_total",
    help: "Orders placed at a Kiosk, by payment method",
    labelNames: ["payment_method"],
    registers: [register],
  });

  const paymentOutcomes = new Counter({
    name: "payment_attempts_total",
    help: "Card Payment Attempts by outcome",
    labelNames: ["outcome"],
    registers: [register],
  });

  const refundsFailed = new Counter({
    name: "refunds_failed_total",
    help: "Refunds that exhausted their retries",
    registers: [register],
  });

  const orderStatuses = new Counter({
    name: "order_status_changes_total",
    help: "Staff-driven Order status changes",
    labelNames: ["status"],
    registers: [register],
  });

  return {
    register,
    observeHttp: (method: string, route: string, status: number, seconds: number) => {
      httpDuration.observe({ method, route, status: String(status) }, seconds);
    },
    onOrderPlaced: (paymentMethod: "CARD" | "PAY_AT_PICKUP") => orders.inc({ payment_method: paymentMethod }),
    onPaymentAttempt: (outcome: string) => paymentOutcomes.inc({ outcome }),
    onRefundFailed: () => refundsFailed.inc(),
    onOrderStatusChanged: (status: string) => orderStatuses.inc({ status }),
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
