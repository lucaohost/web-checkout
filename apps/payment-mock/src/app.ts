import Fastify, { type FastifyRequest } from "fastify";
import { createRandom } from "./random.ts";

export type MockOptions = {
  failureRate: number;
  seed?: number;
  latencyMs: { min: number; max: number };
  timeoutDelayMs: number;
  slowDelayMs: number;
  logger?: boolean;
};

type Charge = {
  key: string;
  amountCents: number;
  status: "APPROVED" | "DECLINED";
  reason?: string;
  refunded: boolean;
};

const DECLINE_REASONS = ["declined", "insufficient_funds", "invalid_card"] as const;
const CHARGE_ERRORS = ["timeout", "server_error", ...DECLINE_REASONS, "slow"] as const;
const RANDOM_CHARGE_FAILURES = ["timeout", "server_error", ...DECLINE_REASONS] as const;
const REFUND_ERRORS = ["timeout", "server_error"] as const;

type ChargeError = (typeof CHARGE_ERRORS)[number];

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function forcedError<T extends string>(request: FastifyRequest, allowed: readonly T[]): T | undefined {
  const header = request.headers["x-force-error"];
  const value = Array.isArray(header) ? header[0] : header;
  return allowed.find((error) => error === value);
}

function chargeReply(charge: Charge) {
  return charge.status === "APPROVED"
    ? { statusCode: 201, body: { key: charge.key, status: charge.status, amountCents: charge.amountCents } }
    : { statusCode: 402, body: { key: charge.key, status: charge.status, reason: charge.reason } };
}

export function buildApp(options: MockOptions) {
  const app = Fastify({ logger: options.logger ?? false, requestIdHeader: "x-request-id" });
  const random = createRandom(options.seed);
  const charges = new Map<string, Charge>();

  const latency = () => sleep(options.latencyMs.min + random() * (options.latencyMs.max - options.latencyMs.min));

  function pickChargeError(request: FastifyRequest): ChargeError | undefined {
    const forced = forcedError(request, CHARGE_ERRORS);
    if (forced) return forced;
    if (random() >= options.failureRate) return undefined;
    return RANDOM_CHARGE_FAILURES[Math.floor(random() * RANDOM_CHARGE_FAILURES.length)];
  }

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: { key: string; amountCents: number } }>(
    "/payments",
    {
      schema: {
        body: {
          type: "object",
          required: ["key", "amountCents"],
          additionalProperties: false,
          properties: {
            key: { type: "string", minLength: 1, maxLength: 200 },
            amountCents: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { key, amountCents } = request.body;
      await latency();

      const existing = charges.get(key);
      if (existing) {
        if (existing.amountCents !== amountCents) {
          return reply.code(422).send({ error: "KEY_REUSED_WITH_DIFFERENT_AMOUNT" });
        }
        if (forcedError(request, ["timeout"])) await sleep(options.timeoutDelayMs);
        const { statusCode, body } = chargeReply(existing);
        return reply.code(statusCode).send(body);
      }

      const error = pickChargeError(request);
      if (error === "server_error") return reply.code(500).send({ error: "server_error" });

      const declineReason = DECLINE_REASONS.find((reason) => reason === error);
      const charge: Charge = declineReason
        ? { key, amountCents, status: "DECLINED", reason: declineReason, refunded: false }
        : { key, amountCents, status: "APPROVED", refunded: false };

      if (error === "slow") await sleep(options.slowDelayMs);
      charges.set(key, charge);
      request.log.info({ key, status: charge.status, forced: error }, "charge processed");
      if (error === "timeout") await sleep(options.timeoutDelayMs);

      const { statusCode, body } = chargeReply(charge);
      return reply.code(statusCode).send(body);
    },
  );

  app.get<{ Params: { key: string } }>("/payments/:key", async (request, reply) => {
    await latency();
    if (forcedError(request, ["timeout"])) await sleep(options.timeoutDelayMs);

    const charge = charges.get(request.params.key);
    if (!charge) return reply.code(404).send({ error: "NOT_FOUND" });
    return { key: charge.key, status: charge.status, amountCents: charge.amountCents, refunded: charge.refunded };
  });

  app.post<{ Params: { key: string } }>("/payments/:key/refund", async (request, reply) => {
    await latency();
    const error = forcedError(request, REFUND_ERRORS);
    if (error === "server_error") return reply.code(500).send({ error: "server_error" });

    const { key } = request.params;
    const charge = charges.get(key);
    const result = charge?.status === "APPROVED" ? "REFUNDED" : "NOTHING_TO_REFUND";
    if (charge && result === "REFUNDED") charge.refunded = true;
    request.log.info({ key, result, forced: error }, "refund processed");

    if (error === "timeout") await sleep(options.timeoutDelayMs);
    return { key, status: result };
  });

  return app;
}
