import { MAX_QUANTITY_PER_PRODUCT } from "../order-limits.ts";

export const LAST_UNITS_THRESHOLD = 5;

export type Availability = "AVAILABLE" | "LAST_UNITS" | "SOLD_OUT";

export function describeAvailability(stock: number): { availability: Availability; maxQuantity: number } {
  const maxQuantity = Math.max(0, Math.min(stock, MAX_QUANTITY_PER_PRODUCT));
  if (stock <= 0) return { availability: "SOLD_OUT", maxQuantity };
  if (stock <= LAST_UNITS_THRESHOLD) return { availability: "LAST_UNITS", maxQuantity };
  return { availability: "AVAILABLE", maxQuantity };
}
