import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "../db/client.ts";
import { idempotencyKeys } from "../db/schema.ts";

export const IN_PROGRESS_TAKEOVER_MS = 30_000;
export const KEY_RETENTION_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HandlerResult = { statusCode: number; body: unknown };

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function kioskIdOf(request: FastifyRequest) {
  return headerValue(request, "x-kiosk-id") ?? "unknown";
}

/**
 * Runs a state-changing handler at most once per Idempotency-Key (ADR-0009):
 * a repeat replays the stored response, and a 5xx stores nothing so the repeat runs again.
 */
export function createIdempotency(db: Database, clock: () => Date) {
  return async function idempotent(
    request: FastifyRequest,
    reply: FastifyReply,
    handler: () => Promise<HandlerResult>,
  ): Promise<FastifyReply> {
    const key = headerValue(request, "idempotency-key");
    if (!key || !UUID.test(key)) {
      return reply.code(400).send({
        error: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Send an Idempotency-Key header with a UUID v4, and reuse it when repeating this request.",
      });
    }

    const route = `${request.method} ${request.url.split("?")[0]}`;
    const bodyFingerprint = createHash("sha256").update(JSON.stringify(request.body ?? null)).digest("hex");
    const now = clock();

    const inserted = await db
      .insert(idempotencyKeys)
      .values({ key, kioskId: kioskIdOf(request), route, bodyFingerprint, state: "IN_PROGRESS", createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });

    if (inserted.length === 0) {
      const [existing] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      if (existing && (existing.route !== route || existing.bodyFingerprint !== bodyFingerprint)) {
        return reply.code(422).send({
          error: "IDEMPOTENCY_KEY_REUSED",
          message: "This Idempotency-Key was already used for a different request.",
        });
      }
      if (existing?.state === "COMPLETED") {
        return reply.code(existing.responseStatus ?? 200).header("Idempotent-Replayed", "true").send(existing.responseBody);
      }
      const takenOver =
        existing &&
        (await db
          .update(idempotencyKeys)
          .set({ updatedAt: now })
          .where(
            and(
              eq(idempotencyKeys.key, key),
              eq(idempotencyKeys.updatedAt, existing.updatedAt),
              lt(idempotencyKeys.updatedAt, new Date(now.getTime() - IN_PROGRESS_TAKEOVER_MS)),
            ),
          )
          .returning({ key: idempotencyKeys.key }));
      if (!takenOver || takenOver.length === 0) {
        return reply.code(409).send({
          error: "REQUEST_IN_PROGRESS",
          message: "The same request is still being processed. Try again in a moment.",
        });
      }
    }

    let result: HandlerResult;
    try {
      result = await handler();
    } catch (error) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      throw error;
    }

    if (result.statusCode >= 500) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    } else {
      await db
        .update(idempotencyKeys)
        .set({ state: "COMPLETED", responseStatus: result.statusCode, responseBody: result.body, updatedAt: clock() })
        .where(eq(idempotencyKeys.key, key));
    }
    return reply.code(result.statusCode).send(result.body);
  };
}

export async function purgeExpiredKeys(db: Database, now: Date) {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(now.getTime() - KEY_RETENTION_MS)));
}
