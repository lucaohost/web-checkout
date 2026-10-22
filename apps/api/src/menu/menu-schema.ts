export const menuSchema = {
  tags: ["kiosk"],
  summary: "The Menu, grouped by Category, with live Availability",
  response: {
    200: {
      type: "object",
      required: ["categories"],
      properties: {
        categories: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "name", "products"],
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              products: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name", "priceCents", "availability", "maxQuantity"],
                  properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    priceCents: { type: "integer" },
                    availability: { type: "string", enum: ["AVAILABLE", "LAST_UNITS", "SOLD_OUT"] },
                    maxQuantity: {
                      type: "integer",
                      description: "Most units of this Product a single Order can take right now",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
