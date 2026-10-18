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
    staffKey,
    forwardForceError: !production,
    seedMenu: env.SEED_MENU !== "false",
  };
}
