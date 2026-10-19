import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError } from "fastify";
import { registerCheckoutRoutes } from "./checkout/checkout-routes.ts";
import type { PaymentDeps } from "./checkout/payment-service.ts";
import { type Config, loadConfig, resolveCorsOrigins } from "./config.ts";
import type { Database } from "./db/client.ts";
import { registerMenuRoutes } from "./menu/menu-routes.ts";
import { createMetrics } from "./observability/metrics.ts";
import { registerStaffRoutes } from "./orders/staff-routes.ts";
import { createHttpPaymentProvider } from "./payments/http-payment-provider.ts";
import type { PaymentProvider } from "./payments/payment-provider.ts";
import { startSweep } from "./sweep.ts";

export type AppDependencies = {
  db: Database;
  config?: Partial<Config>;
  clock?: () => Date;
  paymentProvider?: PaymentProvider;
  logger?: boolean;
};

export function buildApp({ db, config: overrides = {}, clock = () => new Date(), paymentProvider, logger = false }: AppDependencies) {
  const config = { ...loadConfig({}), ...overrides };
  const app = Fastify({
    logger,
    requestIdHeader: "x-request-id",
    // ADR-0008: unknown fields are rejected, not silently dropped, and nothing is coerced.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  const metrics = createMetrics();
  const payments: PaymentDeps = {
    db,
    clock,
    provider:
      paymentProvider ?? createHttpPaymentProvider({ baseUrl: config.paymentProviderUrl, timeoutMs: config.paymentTimeoutMs }),
    log: app.log,
    paymentRetryDelayMs: config.paymentRetryDelayMs,
    refundBackoffMs: config.refundBackoffMs,
    refundMaxTries: config.refundMaxTries,
    onOrderPlaced: metrics.onOrderPlaced,
    onPaymentAttempt: metrics.onPaymentAttempt,
    onRefundFailed: metrics.onRefundFailed,
  };

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "VALIDATION_FAILED", message: error.message });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.code ?? "REQUEST_REJECTED", message: error.message });
    }
    request.log.error({ err: error }, "unexpected error");
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong on our side." });
  });

  app.register(cors, {
    // A list, so a stranger's origin gets no CORS headers at all instead of the kiosk's.
    origin: resolveCorsOrigins(config.corsOrigin),
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-Kiosk-Id",
      "X-Request-Id",
      ...(config.forwardForceError ? ["X-Force-Error"] : []),
    ],
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: "web-checkout API",
        description: "Self-service checkout for a snack bar. Staff endpoints need the X-Staff-Key header.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: { staffKey: { type: "apiKey", in: "header", name: "X-Staff-Key" } },
      },
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.register(async (kiosk) => {
    await kiosk.register(rateLimit, {
      max: config.rateLimitPerMinute,
      timeWindow: "1 minute",
      keyGenerator: (request) => {
        const kioskId = request.headers["x-kiosk-id"];
        return typeof kioskId === "string" ? `kiosk:${kioskId}` : `ip:${request.ip}`;
      },
    });
    registerMenuRoutes(kiosk, { db, clock });
    registerCheckoutRoutes(kiosk, { db, clock, payments, forwardForceError: config.forwardForceError });
  });

  app.register(async (staff) => {
    registerStaffRoutes(staff, {
      payments,
      staffKey: config.staffKey,
      onOrderStatusChanged: metrics.onOrderStatusChanged,
    });
  });

  app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));
  app.get("/metrics", { schema: { hide: true } }, async (_request, reply) => {
    reply.header("content-type", metrics.register.contentType);
    return metrics.register.metrics();
  });

  app.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions.url ?? request.url;
    if (route !== "/metrics") {
      metrics.observeHttp(request.method, route, reply.statusCode, reply.elapsedTime / 1000);
    }
    done();
  });

  let stopSweep = () => {};
  app.addHook("onReady", async () => {
    stopSweep = startSweep(payments, config.sweepIntervalMs);
  });
  app.addHook("onClose", async () => stopSweep());

  return app;
}
