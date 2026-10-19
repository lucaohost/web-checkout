export type Config = ReturnType<typeof loadConfig>;

/** localhost and 127.0.0.1 are the same machine. A comma-separated list is several frontends. */
export function resolveCorsOrigins(raw: string): string[] {
  const origins = new Set<string>();
  for (const part of raw.split(",")) {
    const origin = part.trim();
    if (!origin) continue;
    origins.add(origin);
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      continue;
    }
    const twinHost = url.hostname === "localhost" ? "127.0.0.1" : url.hostname === "127.0.0.1" ? "localhost" : undefined;
    if (!twinHost) continue;
    const twin = new URL(origin);
    twin.hostname = twinHost;
    origins.add(twin.origin);
  }
  return [...origins];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const staffKey = env.STAFF_KEY ?? (production ? undefined : "dev-staff-key");
  if (!staffKey) throw new Error("STAFF_KEY must be set in production");

  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? "postgres://checkout:checkout@localhost:5432/checkout",
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080",
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
