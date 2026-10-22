export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <button type="button" className="welcome__touch" onClick={onStart}>
        <span className="welcome__brand">Snack Counter</span>
        <span className="welcome__headline">Hungry? Order here, pick up at the counter.</span>
        <span className="welcome__cta">Start your order</span>
        <span className="welcome__strip" aria-hidden="true">
          {"\u{1F357} \u{1F9C0} \u{1F96A} \u{1F36B} \u{1F964} \u{1F34A} \u{2615} \u{1F95F} ".repeat(2)}
        </span>
      </button>
    </main>
  );
}
