export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const staffKey = env.STAFF_KEY ?? (production ? undefined : "dev-staff-key");
  if (!staffKey) throw new Error("STAFF_KEY must be set in production");

  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "postgres://checkout:checkout@localhost:5432/checkout",
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173",
    paymentProviderUrl: env.PAYMENT_PROVIDER_URL ?? "http://localhost:4000",
    paymentTimeoutMs: Number(env.PAYMENT_TIMEOUT_MS ?? 3000),
    /** The automatic retry waits between this and twice this, with jitter. */
    paymentRetryDelayMs: Number(env.PAYMENT_RETRY_DELAY_MS ?? 200),
    sweepIntervalMs: Number(env.SWEEP_INTERVAL_MS ?? 5000),
    refundBackoffMs: Number(env.REFUND_BACKOFF_MS ?? 2000),
    refundMaxTries: Number(env.REFUND_MAX_TRIES ?? 5),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 120),
    staffKey,
    forwardForceError: !production,
    seedMenu: env.SEED_MENU !== "false",
  };
}
