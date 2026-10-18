import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PaymentDeps } from "../checkout/payment-service.ts";
import type { OrderStatus } from "../db/schema.ts";
import { errorSchema, uuidParamsSchema } from "../http-schemas.ts";
import { getOrderView } from "./orders.ts";
import { orderViewSchema } from "./order-schema.ts";
import type { OrderAction } from "./order-transitions.ts";
import { listOrders, transitionOrder } from "./staff-service.ts";

const staffSecurity = [{ staffKey: [] }];

function hasStaffKey(request: FastifyRequest, staffKey: string) {
  const sent = request.headers["x-staff-key"];
  if (typeof sent !== "string") return false;
  const expected = Buffer.from(staffKey);
  const actual = Buffer.from(sent);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const ACTIONS: { action: OrderAction; summary: string }[] = [
  { action: "mark-paid", summary: "The Customer paid a Pay at Pickup Order at the counter" },
  { action: "pick-up", summary: "Hand a paid Order to the Customer" },
  { action: "cancel", summary: "Cancel an Order: its Stock returns, and a card payment is refunded" },
];

export function registerStaffRoutes(
  app: FastifyInstance,
  { payments, staffKey, onOrderStatusChanged }: {
    payments: PaymentDeps;
    staffKey: string;
    onOrderStatusChanged?: (status: OrderStatus) => void;
  },
) {
  app.addHook("onRequest", async (request, reply) => {
    if (!hasStaffKey(request, staffKey)) {
      return reply.code(401).send({ error: "STAFF_KEY_REQUIRED", message: "Send the staff key in X-Staff-Key." });
    }
  });

  app.get<{ Querystring: { status?: OrderStatus; limit?: string } }>(
    "/orders",
    {
      schema: {
        tags: ["staff"],
        summary: "Recent Orders for the counter, newest first",
        security: staffSecurity,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["PAYMENT_PENDING", "PAID", "PICKED_UP", "CANCELLED"] },
            limit: { type: "string", pattern: "^[0-9]{1,3}$" },
          },
        },
        response: {
          200: { type: "object", required: ["orders"], properties: { orders: { type: "array", items: orderViewSchema } } },
        },
      },
    },
    async (request) => ({
      orders: await listOrders(payments, {
        ...(request.query.status ? { status: request.query.status } : {}),
        limit: Math.min(Number(request.query.limit ?? 50), 200),
      }),
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/orders/:id",
    {
      schema: {
        tags: ["staff"],
        summary: "One Order",
        security: staffSecurity,
        params: uuidParamsSchema,
        response: { 200: orderViewSchema, 404: errorSchema },
      },
    },
    async (request, reply) =>
      (await getOrderView(payments.db, request.params.id)) ??
      reply.code(404).send({ error: "ORDER_NOT_FOUND", message: "There is no Order with this id." }),
  );

  for (const { action, summary } of ACTIONS) {
    app.post<{ Params: { id: string } }>(
      `/orders/:id/${action}`,
      {
        schema: {
          tags: ["staff"],
          summary,
          security: staffSecurity,
          params: uuidParamsSchema,
          response: { 200: orderViewSchema, 404: errorSchema, 409: errorSchema },
        },
      },
      async (request, reply) => {
        const result = await transitionOrder(
          { ...payments, log: request.log, ...(onOrderStatusChanged ? { onOrderStatusChanged } : {}) },
          request.params.id,
          action,
        );
        return reply.code(result.statusCode).send(result.body);
      },
    );
  }
}
