import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("ships Prometheus alerts for latency, payment failures and failed refunds", async () => {
  const prometheus = await readFile(new URL("../../../observability/prometheus.yml", import.meta.url), "utf8");
  const alerts = await readFile(new URL("../../../observability/alerts.yml", import.meta.url), "utf8");

  expect(prometheus).toContain("rule_files");
  expect(alerts).toContain("histogram_quantile(0.95");
  expect(alerts).toContain("histogram_quantile(0.99");
  expect(alerts).toContain("payment_provider_request_duration_seconds");
  expect(alerts).toContain("payment_attempts_total");
  expect(alerts).toContain("refunds_failed_total");
});
