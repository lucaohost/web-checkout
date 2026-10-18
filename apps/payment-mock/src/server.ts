import { buildApp } from "./app.ts";

const env = process.env;
const app = buildApp({
  failureRate: Number(env.FAILURE_RATE ?? 0.05),
  ...(env.SEED !== undefined ? { seed: Number(env.SEED) } : {}),
  latencyMs: { min: Number(env.LATENCY_MIN_MS ?? 150), max: Number(env.LATENCY_MAX_MS ?? 700) },
  timeoutDelayMs: Number(env.TIMEOUT_DELAY_MS ?? 10_000),
  slowDelayMs: Number(env.SLOW_DELAY_MS ?? 2_500),
  logger: true,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

await app.listen({ host: "0.0.0.0", port: Number(env.PORT ?? 4000) });
