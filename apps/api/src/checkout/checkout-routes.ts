import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.ts";
import { createIdempotency, kioskIdOf } from "../idempotency/idempotency.ts";
import { cancelCheckoutSchema, createCheckoutSchema, getCheckoutSchema } from "./checkout-schema.ts";
import {
  type CheckoutItemInput,
  cancelCheckout,
  createCheckout,
  getCheckoutView,
  releaseExpiredCheckouts,
} from "./checkout-service.ts";

const notFound = { error: "CHECKOUT_NOT_FOUND", message: "There is no Checkout with this id." };

export function registerCheckoutRoutes(app: FastifyInstance, { db, clock }: { db: Database; clock: () => Date }) {
  const idempotent = createIdempotency(db, clock);

  app.post<{ Body: { items: CheckoutItemInput[] } }>("/checkouts", { schema: createCheckoutSchema }, (request, reply) =>
    idempotent(request, reply, async () => {
      const { items } = request.body;
      if (new Set(items.map((item) => item.productId)).size !== items.length) {
        return {
          statusCode: 400,
          body: { error: "DUPLICATE_PRODUCT", message: "Each Product appears once, with its quantity." },
        };
      }

      const result = await createCheckout(db, { kioskId: kioskIdOf(request), items, now: clock() });
      if (result.kind === "conflict") {
        request.log.info({ conflicts: result.conflicts }, "checkout conflict");
        return {
          statusCode: 409,
          body: {
            error: "CHECKOUT_CONFLICT",
            message: "Some prices or quantities changed since the Menu was loaded.",
            conflicts: result.conflicts,
          },
        };
      }
      request.log.info({ checkoutId: result.checkoutId }, "checkout created, stock reserved");
      return { statusCode: 201, body: await getCheckoutView(db, result.checkoutId) };
    }),
  );

  app.get<{ Params: { id: string } }>("/checkouts/:id", { schema: getCheckoutSchema }, async (request, reply) => {
    await releaseExpiredCheckouts(db, clock());
    const view = await getCheckoutView(db, request.params.id);
    return view ?? reply.code(404).send(notFound);
  });

  app.delete<{ Params: { id: string } }>("/checkouts/:id", { schema: cancelCheckoutSchema }, async (request, reply) => {
    await cancelCheckout(db, request.params.id, clock());
    const view = await getCheckoutView(db, request.params.id);
    if (!view) return reply.code(404).send(notFound);
    if (view.status === "CONSUMED") {
      return reply.code(409).send({
        error: "CHECKOUT_COMPLETED",
        message: "This Checkout already became an Order; only staff can cancel it.",
      });
    }
    if (view.status === "PAYING") {
      return reply.code(409).send({ error: "PAYMENT_IN_PROGRESS", message: "A card payment is still in progress." });
    }
    request.log.info({ checkoutId: view.checkoutId }, "checkout released");
    return view;
  });
}
