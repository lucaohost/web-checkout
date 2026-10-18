export const orderViewSchema = {
  type: "object",
  required: ["orderId", "code", "status", "paymentMethod", "totalCents", "cardChargeUnconfirmed", "createdAt", "items"],
  properties: {
    orderId: { type: "string", format: "uuid" },
    code: { type: "string", description: "Short code the Customer reads out at pickup, such as A-042" },
    status: { type: "string", enum: ["PAYMENT_PENDING", "PAID", "PICKED_UP", "CANCELLED"] },
    paymentMethod: { type: "string", enum: ["CARD", "PAY_AT_PICKUP"] },
    totalCents: { type: "integer" },
    cardChargeUnconfirmed: {
      type: "boolean",
      description: "A card charge for this purchase could not be confirmed and is being refunded",
    },
    createdAt: { type: "string", format: "date-time" },
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
  },
} as const;
