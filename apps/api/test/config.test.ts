import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("ALLOW_FORCE_ERROR", () => {
  it("forwards the demo header in production only when the flag is on", () => {
    const production = { NODE_ENV: "production", STAFF_KEY: "test-staff-key" };

    expect(loadConfig({ ...production, ALLOW_FORCE_ERROR: "true" }).forwardForceError).toBe(true);
    expect(loadConfig(production).forwardForceError).toBe(false);
    expect(loadConfig({ ...production, ALLOW_FORCE_ERROR: "false" }).forwardForceError).toBe(false);
    expect(loadConfig({ ALLOW_FORCE_ERROR: "false" }).forwardForceError).toBe(false);
    expect(loadConfig({}).forwardForceError).toBe(true);
  });

  it("turns the flag on in Compose, where the API image still runs as production", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    const compose = await readFile(new URL("../../../docker-compose.yml", import.meta.url), "utf8");

    expect(dockerfile).toContain("NODE_ENV=production");
    expect(compose).toContain('ALLOW_FORCE_ERROR: "true"');
  });
});
