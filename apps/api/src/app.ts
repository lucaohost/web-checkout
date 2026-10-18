import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError } from "fastify";
import { registerCheckoutRoutes } from "./checkout/checkout-routes.ts";
import type { PaymentDeps } from "./checkout/payment-service.ts";
import { type Config, loadConfig } from "./config.ts";
import type { Database } from "./db/client.ts";
import { registerMenuRoutes } from "./menu/menu-routes.ts";
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

  const payments: PaymentDeps = {
    db,
    clock,
    provider:
      paymentProvider ?? createHttpPaymentProvider({ baseUrl: config.paymentProviderUrl, timeoutMs: config.paymentTimeoutMs }),
    log: app.log,
    paymentRetryDelayMs: config.paymentRetryDelayMs,
    refundBackoffMs: config.refundBackoffMs,
    refundMaxTries: config.refundMaxTries,
  };

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "VALIDATION_FAILED", message: error.message });
    }
    request.log.error({ err: error }, "unexpected error");
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong on our side." });
  });

  app.register(cors, {
    origin: config.corsOrigin,
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
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });

  app.register(async (instance) => {
    registerMenuRoutes(instance, { db, clock });
    registerCheckoutRoutes(instance, { db, clock, payments, forwardForceError: config.forwardForceError });
  });

  let stopSweep = () => {};
  app.addHook("onReady", async () => {
    stopSweep = startSweep(payments, config.sweepIntervalMs);
  });
  app.addHook("onClose", async () => stopSweep());

  return app;
}
