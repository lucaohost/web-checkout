import { and, count, eq, lt, sql } from "drizzle-orm";
import type { HandlerResult } from "../idempotency/idempotency.ts";
import { checkouts, paymentAttempts } from "../db/schema.ts";
import { createOrderFromCheckout, getOrderView } from "../orders/orders.ts";
import type { ProviderContext } from "../payments/payment-provider.ts";
import { attemptRefund, type RefundDeps, requestRefund } from "../payments/refunds.ts";
import { type CardOutcome, resolveCardPayment } from "../payments/resolve-card-payment.ts";
import { MAX_CARD_ATTEMPTS, releaseExpiredCheckouts } from "./checkout-service.ts";

export type PaymentDeps = RefundDeps & {
  paymentRetryDelayMs: number;
  onPaymentAttempt?: (outcome: CardOutcome["kind"]) => void;
  onOrderPlaced?: (paymentMethod: "CARD" | "PAY_AT_PICKUP") => void;
};

/** After a failed card attempt the Customer still gets at least this long to choose what to do next. */
const DECISION_WINDOW_MS = 60_000;
const STALE_PAYMENT_MS = 60_000;

type Checkout = typeof checkouts.$inferSelect;

const problem = (statusCode: number, error: string, message: string): HandlerResult => ({
  statusCode,
  body: { error, message },
});

function unavailable(checkout: Checkout | undefined): HandlerResult | undefined {
  if (!checkout) return problem(404, "CHECKOUT_NOT_FOUND", "There is no Checkout with this id.");
  if (checkout.status === "RELEASED") {
    return problem(410, "CHECKOUT_EXPIRED", "This Checkout was cancelled or expired, and its Stock was released.");
  }
  if (checkout.status === "CONSUMED") return problem(409, "CHECKOUT_COMPLETED", "This Checkout already became an Order.");
  if (checkout.status === "PAYING") return problem(409, "PAYMENT_IN_PROGRESS", "A card payment is still in progress.");
  return undefined;
}

async function placedOrder(deps: PaymentDeps, orderId: string): Promise<HandlerResult> {
  return { statusCode: 201, body: await getOrderView(deps.db, orderId) };
}

export async function payCheckout(
  deps: PaymentDeps,
  checkoutId: string,
  method: "CARD" | "PAY_AT_PICKUP",
  context: ProviderContext,
): Promise<HandlerResult> {
  await releaseExpiredCheckouts(deps.db, deps.clock());
  const [checkout] = await deps.db.select().from(checkouts).where(eq(checkouts.id, checkoutId));
  const blocked = unavailable(checkout);
  if (blocked || !checkout) return blocked!;
  return method === "PAY_AT_PICKUP" ? payAtPickup(deps, checkout) : payByCard(deps, checkout, context);
}

async function payAtPickup(deps: PaymentDeps, checkout: Checkout): Promise<HandlerResult> {
  const now = deps.clock();
  const orderId = await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .update(checkouts)
      .set({ status: "CONSUMED", updatedAt: now })
      .where(and(eq(checkouts.id, checkout.id), eq(checkouts.status, "ACTIVE")))
      .returning({ id: checkouts.id });
    if (claimed.length === 0) return undefined;
    return createOrderFromCheckout(tx, checkout, { status: "PAYMENT_PENDING", paymentMethod: "PAY_AT_PICKUP", now });
  });
  if (!orderId) {
    const [current] = await deps.db.select().from(checkouts).where(eq(checkouts.id, checkout.id));
    return unavailable(current) ?? problem(409, "PAYMENT_IN_PROGRESS", "A payment is still in progress.");
  }
  deps.onOrderPlaced?.("PAY_AT_PICKUP");
  deps.log.info({ checkoutId: checkout.id, orderId }, "order placed, to be paid at pickup");
  return placedOrder(deps, orderId);
}

async function payByCard(deps: PaymentDeps, checkout: Checkout, context: ProviderContext): Promise<HandlerResult> {
  const { db, clock, log } = deps;
  const [{ attempts } = { attempts: 0 }] = await db
    .select({ attempts: count() })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.checkoutId, checkout.id));
  if (checkout.cardChargeUnconfirmed || attempts >= MAX_CARD_ATTEMPTS) {
    return problem(409, "CARD_NOT_ALLOWED", "This Checkout cannot be paid by card any more; choose Pay at Pickup.");
  }

  const startedAt = clock();
  const claimed = await db
    .update(checkouts)
    .set({ status: "PAYING", updatedAt: startedAt })
    .where(and(eq(checkouts.id, checkout.id), eq(checkouts.status, "ACTIVE")))
    .returning({ id: checkouts.id });
  if (claimed.length === 0) return problem(409, "PAYMENT_IN_PROGRESS", "A payment is still in progress.");

  const attemptNumber = attempts + 1;
  const providerKey = `${checkout.id}:${attemptNumber}`;
  const [attempt] = await db
    .insert(paymentAttempts)
    .values({ checkoutId: checkout.id, attemptNumber, providerKey, outcome: "PENDING", createdAt: startedAt, updatedAt: startedAt })
    .returning({ id: paymentAttempts.id });

  let outcome: CardOutcome;
  try {
    const base = deps.paymentRetryDelayMs;
    outcome = await resolveCardPayment(deps.provider, { key: providerKey, amountCents: checkout.totalCents }, context, {
      retryDelayMs: () => base + Math.random() * base,
    });
  } catch (error) {
    log.error({ err: error, providerKey }, "card payment crashed; treating the charge as unconfirmed");
    outcome = { kind: "UNKNOWN" };
  }

  const finishedAt = clock();
  deps.onPaymentAttempt?.(outcome.kind);
  log.info({ checkoutId: checkout.id, providerKey, outcome }, "card payment attempt finished");
  await db
    .update(paymentAttempts)
    .set({ outcome: outcome.kind, detail: outcome.kind === "DECLINED" ? outcome.reason : null, updatedAt: finishedAt })
    .where(eq(paymentAttempts.id, attempt!.id));

  if (outcome.kind === "APPROVED") {
    const orderId = await db.transaction(async (tx) => {
      await tx.update(checkouts).set({ status: "CONSUMED", updatedAt: finishedAt }).where(eq(checkouts.id, checkout.id));
      return createOrderFromCheckout(tx, checkout, { status: "PAID", paymentMethod: "CARD", now: finishedAt });
    });
    deps.onOrderPlaced?.("CARD");
    return placedOrder(deps, orderId);
  }

  const unconfirmed = outcome.kind === "UNKNOWN";
  const reopened = {
    status: "ACTIVE" as const,
    updatedAt: finishedAt,
    expiresAt: sql`greatest(${checkouts.expiresAt}, ${new Date(finishedAt.getTime() + DECISION_WINDOW_MS)})`,
    ...(unconfirmed ? { cardChargeUnconfirmed: true } : {}),
  };
  const refundId = await db.transaction(async (tx) => {
    await tx.update(checkouts).set(reopened).where(eq(checkouts.id, checkout.id));
    return unconfirmed ? requestRefund(tx, attempt!.id, finishedAt) : undefined;
  });
  if (refundId) void attemptRefund(deps, refundId, context, finishedAt);

  const cardAttemptsLeft = unconfirmed ? 0 : MAX_CARD_ATTEMPTS - attemptNumber;
  const options = cardAttemptsLeft > 0 ? ["TRY_ANOTHER_CARD", "PAY_AT_PICKUP", "CANCEL"] : ["PAY_AT_PICKUP", "CANCEL"];
  const messages = {
    DECLINED: ["PAYMENT_DECLINED", "The card was declined."],
    FAILED: ["PAYMENT_FAILED", "The card payment could not be completed, and nothing was charged."],
    UNKNOWN: ["PAYMENT_UNCONFIRMED", "The card payment could not be confirmed; if it was charged, it will be refunded."],
  } as const;
  const [error, message] = messages[outcome.kind];
  return {
    statusCode: 402,
    body: {
      error,
      message,
      ...(outcome.kind === "DECLINED" ? { reason: outcome.reason } : {}),
      options,
      cardAttemptsLeft,
    },
  };
}

/** A process that died mid-payment leaves a Checkout PAYING; its charge can no longer be trusted either way. */
export async function recoverStalePayments(deps: PaymentDeps) {
  const now = deps.clock();
  const stale = await deps.db
    .select({ id: checkouts.id })
    .from(checkouts)
    .where(and(eq(checkouts.status, "PAYING"), lt(checkouts.updatedAt, new Date(now.getTime() - STALE_PAYMENT_MS))));

  for (const { id } of stale) {
    await deps.db.transaction(async (tx) => {
      const pending = await tx
        .update(paymentAttempts)
        .set({ outcome: "UNKNOWN", updatedAt: now })
        .where(and(eq(paymentAttempts.checkoutId, id), eq(paymentAttempts.outcome, "PENDING")))
        .returning({ id: paymentAttempts.id });
      for (const attempt of pending) await requestRefund(tx, attempt.id, now, { leaveToSweep: true });
      await tx
        .update(checkouts)
        .set({ status: "ACTIVE", cardChargeUnconfirmed: true, updatedAt: now })
        .where(and(eq(checkouts.id, id), eq(checkouts.status, "PAYING")));
    });
    deps.log.warn({ checkoutId: id }, "recovered a payment abandoned mid-flight; its charge will be refunded");
  }
}
