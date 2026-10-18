import { errorSchema, idempotencyHeadersSchema, uuidParamsSchema } from "../http-schemas.ts";
import { MAX_PRODUCTS_PER_ORDER, MAX_QUANTITY_PER_PRODUCT } from "../order-limits.ts";

export const checkoutViewSchema = {
  type: "object",
  required: ["checkoutId", "status", "totalCents", "expiresAt", "items", "cardAttemptsLeft", "cardAllowed"],
  properties: {
    checkoutId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "PAYING", "CONSUMED", "RELEASED"] },
    totalCents: { type: "integer" },
    expiresAt: { type: "string", format: "date-time" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["productId", "name", "emoji", "quantity", "unitPriceCents"],
        properties: {
          productId: { type: "string", format: "uuid" },
          name: { type: "string" },
          emoji: { type: "string" },
          quantity: { type: "integer" },
          unitPriceCents: { type: "integer" },
        },
      },
    },
    cardAttemptsLeft: { type: "integer" },
    cardAllowed: { type: "boolean" },
  },
} as const;

const conflictErrorSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        required: [
          "productId",
          "name",
          "reasons",
          "requestedQuantity",
          "availableQuantity",
          "seenUnitPriceCents",
          "currentUnitPriceCents",
        ],
        properties: {
          productId: { type: "string", format: "uuid" },
          name: { type: ["string", "null"] },
          reasons: { type: "array", items: { type: "string", enum: ["SOLD_OUT", "NOT_ENOUGH_STOCK", "PRICE_CHANGED"] } },
          requestedQuantity: { type: "integer" },
          availableQuantity: { type: "integer", description: "How many of the requested units can be reserved" },
          seenUnitPriceCents: { type: "integer" },
          currentUnitPriceCents: { type: "integer" },
        },
      },
    },
  },
} as const;

export const createCheckoutSchema = {
  tags: ["kiosk"],
  summary: "Confirm a Cart: check prices, reserve Stock for 3 minutes",
  headers: idempotencyHeadersSchema,
  body: {
    type: "object",
    required: ["items"],
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PRODUCTS_PER_ORDER,
        items: {
          type: "object",
          required: ["productId", "quantity", "unitPriceCents"],
          additionalProperties: false,
          properties: {
            productId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, maximum: MAX_QUANTITY_PER_PRODUCT },
            unitPriceCents: { type: "integer", minimum: 0, description: "The price the Customer saw" },
          },
        },
      },
    },
  },
  response: {
    201: checkoutViewSchema,
    400: errorSchema,
    409: conflictErrorSchema,
    422: errorSchema,
  },
} as const;

export const getCheckoutSchema = {
  tags: ["kiosk"],
  summary: "The current state of a Checkout, to recover after a lost connection",
  params: uuidParamsSchema,
  response: { 200: checkoutViewSchema, 404: errorSchema },
} as const;

export const cancelCheckoutSchema = {
  tags: ["kiosk"],
  summary: "Abandon a Checkout and return its reserved Stock",
  params: uuidParamsSchema,
  response: { 200: checkoutViewSchema, 404: errorSchema, 409: errorSchema },
} as const;
