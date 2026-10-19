import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";

const db = createDatabase(inject("databaseUrl"));
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

afterAll(async () => {
  await db.$client.end();
});

it("answers /health so Compose and a teammate can see the API is up", async () => {
  const app = buildApp({ db, config: { sweepIntervalMs: 0 } });
  apps.push(app);

  const response = await app.inject({ method: "GET", url: "/health" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok" });
});

it("exposes Prometheus metrics for request duration and Order outcomes", async () => {
  const app = buildApp({ db, config: { sweepIntervalMs: 0 } });
  apps.push(app);
  await app.inject({ method: "GET", url: "/health" });

  const response = await app.inject({ method: "GET", url: "/metrics" });

  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toMatch(/text\/plain/);
  expect(response.body).toContain("http_request_duration_seconds");
  expect(response.body).toContain("orders_placed_total");
});
