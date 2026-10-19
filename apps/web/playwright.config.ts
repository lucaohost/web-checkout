import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: [
    {
      command: "node src/server.ts",
      cwd: "../payment-mock",
      url: "http://127.0.0.1:4100/health",
      env: { PORT: "4100", FAILURE_RATE: "0", LATENCY_MIN_MS: "0", LATENCY_MAX_MS: "0" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node e2e/start-api.mjs",
      url: "http://127.0.0.1:3100/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      env: { VITE_API_URL: "http://127.0.0.1:3100" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
