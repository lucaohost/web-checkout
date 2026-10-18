import { describe, expect, it } from "vitest";
import type { OrderStatus } from "../src/db/schema.ts";
import { nextOrderStatus, type OrderAction } from "../src/orders/order-transitions.ts";

describe("Order status transitions", () => {
  it.each<[OrderStatus, OrderAction, OrderStatus | undefined]>([
    ["PAYMENT_PENDING", "mark-paid", "PAID"],
    ["PAYMENT_PENDING", "pick-up", undefined],
    ["PAYMENT_PENDING", "cancel", "CANCELLED"],
    ["PAID", "mark-paid", undefined],
    ["PAID", "pick-up", "PICKED_UP"],
    ["PAID", "cancel", "CANCELLED"],
    ["PICKED_UP", "mark-paid", undefined],
    ["PICKED_UP", "pick-up", undefined],
    ["PICKED_UP", "cancel", undefined],
    ["CANCELLED", "mark-paid", undefined],
    ["CANCELLED", "pick-up", undefined],
    ["CANCELLED", "cancel", undefined],
  ])("%s, %s → %s", (status, action, expected) => {
    expect(nextOrderStatus(status, action)).toBe(expected);
  });
});
