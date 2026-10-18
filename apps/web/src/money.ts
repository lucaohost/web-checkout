const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number) {
  return currency.format(cents / 100);
}
