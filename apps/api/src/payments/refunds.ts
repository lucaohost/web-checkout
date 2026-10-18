import { and, eq, lte } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Executor } from "../checkout/checkout-service.ts";
import type { Database } from "../db/client.ts";
import { paymentAttempts, refunds } from "../db/schema.ts";
import type { PaymentProvider, ProviderContext } from "./payment-provider.ts";

export type RefundDeps = {
  db: Database;
  clock: () => Date;
  provider: PaymentProvider;
  log: FastifyBaseLogger;
  refundBackoffMs: number;
  refundMaxTries: number;
  onRefundFailed?: () => void;
};

const CLAIM_MS = 60_000;

/**
 * Records a Refund for a Payment Attempt. By default the caller claims the first try itself;
 * `leaveToSweep` makes it due right away for the background sweep instead.
 */
export async function requestRefund(
  executor: Executor,
  paymentAttemptId: string,
  now: Date,
  { leaveToSweep = false }: { leaveToSweep?: boolean } = {},
) {
  const [refund] = await executor
    .insert(refunds)
    .values({
      paymentAttemptId,
      status: "REQUESTED",
      nextTryAt: leaveToSweep ? now : new Date(now.getTime() + CLAIM_MS),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: refunds.id });
  return refund?.id;
}

/** One try at a Refund. Never throws: failures are recorded and retried by the sweep (ADR-0012). */
export async function attemptRefund(deps: RefundDeps, refundId: string, context: ProviderContext, startedAt = deps.clock()) {
  const { db, provider, log } = deps;
  try {
    const [refund] = await db
      .select({ tries: refunds.tries, providerKey: paymentAttempts.providerKey })
      .from(refunds)
      .innerJoin(paymentAttempts, eq(paymentAttempts.id, refunds.paymentAttemptId))
      .where(and(eq(refunds.id, refundId), eq(refunds.status, "REQUESTED")));
    if (!refund) return;

    const result = await provider.refund(refund.providerKey, context);
    const tries = refund.tries + 1;
    const updatedAt = deps.clock();

    if (result.kind !== "error") {
      await db.update(refunds).set({ status: "COMPLETED", tries, lastError: null, updatedAt }).where(eq(refunds.id, refundId));
      log.info({ refundId, providerKey: refund.providerKey, result: result.kind }, "refund completed");
      return;
    }

    if (tries >= deps.refundMaxTries) {
      await db.update(refunds).set({ status: "FAILED", tries, lastError: result.error, updatedAt }).where(eq(refunds.id, refundId));
      deps.onRefundFailed?.();
      log.error({ refundId, providerKey: refund.providerKey, tries }, "refund failed for good; money must be returned by hand");
      return;
    }

    const nextTryAt = new Date(startedAt.getTime() + deps.refundBackoffMs * 2 ** (tries - 1));
    await db.update(refunds).set({ tries, lastError: result.error, nextTryAt, updatedAt }).where(eq(refunds.id, refundId));
    log.warn({ refundId, tries, error: result.error, nextTryAt }, "refund try failed, will retry");
  } catch (error) {
    log.error({ err: error, refundId }, "refund try crashed");
  }
}

export async function processDueRefunds(deps: RefundDeps) {
  const now = deps.clock();
  const due = await deps.db
    .update(refunds)
    .set({ nextTryAt: new Date(now.getTime() + CLAIM_MS) })
    .where(and(eq(refunds.status, "REQUESTED"), lte(refunds.nextTryAt, now)))
    .returning({ id: refunds.id });
  for (const { id } of due) await attemptRefund(deps, id, {}, now);
}
