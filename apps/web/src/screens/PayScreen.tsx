import { useState } from "react";
import { formatCents } from "../money.ts";

export function PayScreen({
  totalCents,
  busy,
  notice,
  onCard,
  onPayAtPickup,
  onCancel,
}: {
  totalCents: number;
  busy: boolean;
  notice?: string | null;
  onCard: () => void;
  onPayAtPickup: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="pay">
      <h1 className="notice__title">How would you like to pay?</h1>
      {notice && (
        <p className="ordering__banner" role="status">
          {notice}
        </p>
      )}
      <p className="pay__total">
        Total <strong>{formatCents(totalCents)}</strong>
      </p>
      <div className="pay__methods">
        <button type="button" className="button button--primary button--wide" disabled={busy} onClick={onCard}>
          Card
        </button>
        <button type="button" className="button button--wide" disabled={busy} onClick={onPayAtPickup}>
          Pay at pickup
        </button>
      </div>
      <p className="notice__body">Cash is taken at the counter when you collect your order.</p>
      <button type="button" className="button button--quiet" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </main>
  );
}

export function CardTerminal({
  busy,
  forceError,
  onForceError,
  onTap,
  onCancel,
}: {
  busy: boolean;
  forceError: string;
  onForceError: (value: string) => void;
  onTap: () => void;
  onCancel: () => void;
}) {
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <main className="pay">
      <h1 className="notice__title">Card</h1>
      <p className="notice__body">Hold your card or phone against the reader next to this screen.</p>
      <div className="terminal" aria-hidden="true">
        <span className="terminal__pad" />
      </div>
      <button type="button" className="button button--primary" disabled={busy} onClick={onTap}>
        {busy ? "Processing…" : "Tap your card"}
      </button>
      <button type="button" className="button button--quiet" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
      <details className="demo" open={demoOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setDemoOpen((open) => !open);
          }}
        >
          Demo tools
        </summary>
        <label>
          Force card outcome
          <select
            aria-label="Force card outcome"
            value={forceError}
            disabled={busy}
            onChange={(event) => onForceError(event.target.value)}
          >
            <option value="">As the provider decides</option>
            <option value="declined">Declined</option>
            <option value="timeout">Timeout</option>
          </select>
        </label>
      </details>
    </main>
  );
}
