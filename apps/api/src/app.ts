import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { type Config, loadConfig } from "./config.ts";
import type { Database } from "./db/client.ts";
import { registerMenuRoutes } from "./menu/menu-routes.ts";

export type AppDependencies = {
  db: Database;
  config?: Partial<Config>;
  clock?: () => Date;
  logger?: boolean;
};

export function buildApp({ db, config: overrides = {}, clock = () => new Date(), logger = false }: AppDependencies) {
  const config = { ...loadConfig({}), ...overrides };
  const app = Fastify({ logger });

  app.register(cors, {
    origin: config.corsOrigin,
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
  });

  return app;
}
