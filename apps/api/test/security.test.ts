import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";

const KIOSK_ORIGIN = "http://localhost:5173";
const db = createDatabase(inject("databaseUrl"));
const apps: FastifyInstance[] = [];

function start(config: Parameters<typeof buildApp>[0]["config"] = {}) {
  const app = buildApp({ db, config: { corsOrigin: KIOSK_ORIGIN, sweepIntervalMs: 0, ...config } });
  apps.push(app);
  return app;
}

function preflight(app: FastifyInstance, origin: string, requestHeaders = "content-type,idempotency-key") {
  return app.inject({
    method: "OPTIONS",
    url: "/checkouts",
    headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": requestHeaders },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

afterAll(async () => {
  await db.$client.end();
});

describe("CORS", () => {
  it("lets only the kiosk's origin call the API from a browser", async () => {
    const app = start();

    const kiosk = await preflight(app, KIOSK_ORIGIN);
    const stranger = await preflight(app, "https://evil.example");

    expect(kiosk.headers["access-control-allow-origin"]).toBe(KIOSK_ORIGIN);
    expect(stranger.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("accepts the demo's X-Force-Error header only outside production", async () => {
    const demo = await preflight(start(), KIOSK_ORIGIN, "x-force-error");
    const production = await preflight(start({ forwardForceError: false }), KIOSK_ORIGIN, "x-force-error");

    expect(String(demo.headers["access-control-allow-headers"]).toLowerCase()).toContain("x-force-error");
    expect(String(production.headers["access-control-allow-headers"]).toLowerCase()).not.toContain("x-force-error");
  });
});

describe("rate limiting", () => {
  it("slows down a single Kiosk that floods the API without affecting the others", async () => {
    const app = start({ rateLimitPerMinute: 3 });
    const fromKiosk = (kioskId: string) => app.inject({ method: "GET", url: "/menu", headers: { "x-kiosk-id": kioskId } });

    for (let i = 0; i < 3; i++) await fromKiosk("kiosk-1");
    const flooded = await fromKiosk("kiosk-1");
    const neighbour = await fromKiosk("kiosk-2");

    expect(flooded.statusCode).toBe(429);
    expect(neighbour.statusCode).toBe(200);
  });
});
