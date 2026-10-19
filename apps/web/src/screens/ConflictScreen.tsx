import type { Conflict } from "../api/client.ts";
import { formatCents } from "../money.ts";

function describe(conflict: Conflict) {
  const bits: string[] = [];
  if (conflict.reasons.includes("SOLD_OUT") || conflict.availableQuantity <= 0) bits.push("sold out — removed");
  else if (conflict.reasons.includes("NOT_ENOUGH_STOCK")) bits.push(`only ${conflict.availableQuantity} left`);
  if (conflict.reasons.includes("PRICE_CHANGED")) {
    bits.push(`${formatCents(conflict.seenUnitPriceCents)} → ${formatCents(conflict.currentUnitPriceCents)}`);
  }
  return bits.join(" · ");
}

export function ConflictScreen({
  conflicts,
  onContinue,
  onEdit,
}: {
  conflicts: Conflict[];
  onContinue: () => void;
  onEdit: () => void;
}) {
  return (
    <main className="notice">
      <section aria-label="Your order changed" className="conflict">
        <h1 className="notice__title">Your order changed</h1>
        <p className="notice__body">A few things on the menu moved while you were choosing. Check the list, then continue or edit.</p>
        <ul className="conflict__list">
          {conflicts.map((conflict) => (
            <li key={conflict.productId}>
              <strong>{conflict.name ?? "A product"}</strong>
              <span>{describe(conflict)}</span>
            </li>
          ))}
        </ul>
        <div className="notice__actions">
          <button type="button" className="button button--primary" onClick={onContinue}>
            Continue with these changes
          </button>
          <button type="button" className="button" onClick={onEdit}>
            Edit order
          </button>
        </div>
      </section>
    </main>
  );
}
