import { releaseExpiredCheckouts } from "./checkout/checkout-service.ts";
import { type PaymentDeps, recoverStalePayments } from "./checkout/payment-service.ts";
import { purgeExpiredKeys } from "./idempotency/idempotency.ts";
import { processDueRefunds } from "./payments/refunds.ts";

/** The background housekeeping from ADR-0010 and ADR-0012. Returns a function that stops it. */
export function startSweep(deps: PaymentDeps, intervalMs: number) {
  if (intervalMs <= 0) return () => {};
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = deps.clock();
      await releaseExpiredCheckouts(deps.db, now);
      await recoverStalePayments(deps);
      await processDueRefunds(deps);
      await purgeExpiredKeys(deps.db, now);
    } catch (error) {
      deps.log.error({ err: error }, "sweep failed; it will run again");
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
