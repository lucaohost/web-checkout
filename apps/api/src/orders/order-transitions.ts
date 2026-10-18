import type { OrderStatus } from "../db/schema.ts";

export type OrderAction = "mark-paid" | "pick-up" | "cancel";

// ADR-0013. No move from PAYMENT_PENDING to PICKED_UP: an Order is never handed over unpaid.
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>> = {
  PAYMENT_PENDING: { "mark-paid": "PAID", cancel: "CANCELLED" },
  PAID: { "pick-up": "PICKED_UP", cancel: "CANCELLED" },
  PICKED_UP: {},
  CANCELLED: {},
};

export function nextOrderStatus(status: OrderStatus, action: OrderAction): OrderStatus | undefined {
  return TRANSITIONS[status][action];
}
