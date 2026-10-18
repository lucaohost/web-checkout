import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const mockDirectory = fileURLToPath(new URL("../../../payment-mock", import.meta.url));

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/** Starts the real payment-mock service as its own process, the way the API meets it in production. */
export async function startPaymentMock(env: Record<string, string> = {}) {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ["src/server.ts"], {
    cwd: mockDirectory,
    env: { ...process.env, PORT: String(port), FAILURE_RATE: "0", LATENCY_MIN_MS: "0", LATENCY_MAX_MS: "0", ...env },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  for (let tries = 0; tries < 100; tries++) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return {
    baseUrl,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      }),
  };
}
