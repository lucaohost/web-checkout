import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "../checkout/checkout-service.ts";
import type { PaymentDeps } from "../checkout/payment-service.ts";
import { type OrderStatus, orders, paymentAttempts } from "../db/schema.ts";
import type { HandlerResult } from "../idempotency/idempotency.ts";
import { attemptRefund, requestRefund } from "../payments/refunds.ts";
import { getOrderView } from "./orders.ts";
import { nextOrderStatus, type OrderAction } from "./order-transitions.ts";

const VERBS: Record<OrderAction, string> = { "mark-paid": "marked as paid", "pick-up": "picked up", cancel: "cancelled" };

async function returnOrderStock(tx: Executor, orderId: string) {
  await tx.execute(sql`
    update products set stock = products.stock + order_items.quantity
    from order_items
    where order_items.order_id = ${orderId} and products.id = order_items.product_id
  `);
}

export async function transitionOrder(
  deps: PaymentDeps & { onOrderStatusChanged?: (status: OrderStatus) => void },
  orderId: string,
  action: OrderAction,
): Promise<HandlerResult> {
  const now = deps.clock();
  const outcome = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { kind: "not_found" as const };
    const next = nextOrderStatus(order.status, action);
    if (!next) return { kind: "invalid" as const, status: order.status };

    await tx.update(orders).set({ status: next, updatedAt: now }).where(eq(orders.id, orderId));
    let refundId: string | undefined;
    if (action === "cancel") {
      await returnOrderStock(tx, orderId);
      if (order.status === "PAID" && order.paymentMethod === "CARD") {
        const [approved] = await tx
          .select({ id: paymentAttempts.id })
          .from(paymentAttempts)
          .where(and(eq(paymentAttempts.checkoutId, order.checkoutId), eq(paymentAttempts.outcome, "APPROVED")));
        if (approved) refundId = await requestRefund(tx, approved.id, now);
      }
    }
    return { kind: "moved" as const, next, refundId };
  });

  if (outcome.kind === "not_found") {
    return { statusCode: 404, body: { error: "ORDER_NOT_FOUND", message: "There is no Order with this id." } };
  }
  if (outcome.kind === "invalid") {
    return {
      statusCode: 409,
      body: { error: "INVALID_TRANSITION", message: `An Order that is ${outcome.status} cannot be ${VERBS[action]}.` },
    };
  }

  deps.onOrderStatusChanged?.(outcome.next);
  deps.log.info({ orderId, action, status: outcome.next }, "order status changed by staff");
  if (outcome.refundId) void attemptRefund(deps, outcome.refundId, {}, now);
  return { statusCode: 200, body: await getOrderView(deps.db, orderId) };
}

export async function listOrders(deps: PaymentDeps, { status, limit }: { status?: OrderStatus; limit: number }) {
  const rows = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return Promise.all(rows.map((row) => getOrderView(deps.db, row.id)));
}
