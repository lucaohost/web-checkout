import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/support/global-setup.ts"],
    // Test files share one Postgres container and truncate tables between tests.
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
